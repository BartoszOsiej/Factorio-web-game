import { supabase } from '../../lib/supabase';

export interface TradeListing {
  id: string;
  seller_id: string;
  seller_username: string;
  item_name: string;
  item_quantity: number;
  price_pln: number;
  status: 'active' | 'reserved' | 'completed' | 'cancelled';
  created_at: string;
}

export interface TradeAgreement {
  id: string;
  listing_id: string | null;
  seller_id: string;
  buyer_id: string;
  buyer_username: string;
  item_name: string;
  item_quantity: number;
  price_pln: number;
  status: 'pending' | 'fee_paid' | 'completed' | 'disputed' | 'cancelled';
  chat_proof: string | null;
  created_at: string;
}

export interface TradeFee {
  id: string;
  agreement_id: string;
  payer_id: string;
  amount_grosz: number;
  stripe_payment_intent_id: string | null;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  created_at: string;
  paid_at: string | null;
}

export interface TradeBan {
  id: string;
  user_id: string;
  reason: string;
  unpaid_agreements: number;
  banned_at: string;
  active: boolean;
}

const TRADE_CHECKOUT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trade-fee-checkout`;

export class TradeService {
  static async getActiveListings(): Promise<TradeListing[]> {
    const { data, error } = await supabase
      .from('trade_listings')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  static async getMyListings(userId: string): Promise<TradeListing[]> {
    const { data, error } = await supabase
      .from('trade_listings')
      .select('*')
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  static async createListing(
    sellerId: string, sellerUsername: string,
    itemName: string, itemQuantity: number, pricePln: number,
  ): Promise<TradeListing> {
    const { data, error } = await supabase
      .from('trade_listings')
      .insert({
        seller_id: sellerId,
        seller_username: sellerUsername,
        item_name: itemName,
        item_quantity: itemQuantity,
        price_pln: pricePln,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async cancelListing(listingId: string): Promise<void> {
    const { error } = await supabase
      .from('trade_listings')
      .update({ status: 'cancelled' })
      .eq('id', listingId);
    if (error) throw error;
  }

  static async getMyAgreements(userId: string): Promise<TradeAgreement[]> {
    const { data, error } = await supabase
      .from('trade_agreements')
      .select('*')
      .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  static async getMyFees(userId: string): Promise<TradeFee[]> {
    const { data, error } = await supabase
      .from('trade_fees')
      .select('*')
      .eq('payer_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  static async getPendingFees(userId: string): Promise<TradeFee[]> {
    const { data, error } = await supabase
      .from('trade_fees')
      .select('*')
      .eq('payer_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  static async checkBan(userId: string): Promise<TradeBan | null> {
    const { data, error } = await supabase
      .from('trade_bans')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async getUnpaidCount(userId: string): Promise<number> {
    const { data, error } = await supabase
      .rpc('count_unpaid_fees', { p_user_id: userId });
    if (error) throw error;
    return data ?? 0;
  }

  static async payFee(fee: TradeFee, userId: string, username: string): Promise<string> {
    const res = await fetch(TRADE_CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({
        feeId: fee.id,
        agreementId: fee.agreement_id,
        userId,
        username,
        amountGrosz: fee.amount_grosz,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to create checkout');
    return data.url;
  }

  // Chat scanning: extract price from trade chat messages
  static scanMessageForPrice(text: string): number | null {
    const patterns = [
      /(\d+)\s*(?:zł|zl|pln|zloty|złotych)/i,
      /(\d+)\s*zł\b/i,
      /cena\s*:?\s*(\d+)/i,
      /po\s*(\d+)\s*zł/i,
    ];
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  // Create fee request from chat agreement
  static async createFeeFromChat(
    sellerId: string, _sellerUsername: string,
    buyerId: string, buyerUsername: string,
    pricePln: number, itemName: string, quantity: number,
    chatProof: string,
  ): Promise<TradeFee> {
    const amountGrosz = Math.ceil(pricePln * 0.05 * 100); // 5% in grosz

    // Create agreement
    const { data: agreement, error: agError } = await supabase
      .from('trade_agreements')
      .insert({
        seller_id: sellerId,
        buyer_id: buyerId,
        buyer_username: buyerUsername,
        item_name: itemName,
        item_quantity: quantity,
        price_pln: pricePln,
        chat_proof: chatProof,
        status: 'pending',
      })
      .select()
      .single();
    if (agError) throw agError;

    // Create fee
    const { data: fee, error: feeError } = await supabase
      .from('trade_fees')
      .insert({
        agreement_id: agreement.id,
        payer_id: sellerId,
        amount_grosz: amountGrosz,
        status: 'pending',
      })
      .select()
      .single();
    if (feeError) throw feeError;

    return fee;
  }
}
