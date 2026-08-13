import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUBSCRIPTION_PRICE_IDS = new Set([
  "price_1TYW6EK4E5IHLVVAW4SaLTXU", // Starter
  "price_1TYW9LK4E5IHLVVAZrXNVjWk", // Premium
]);

interface CheckoutPayload {
  priceId: string;
  userId: string;
  username?: string;
  successUrl?: string;
  cancelUrl?: string;
}

console.info("stripe-checkout started");

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, _ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { priceId, userId, username, successUrl, cancelUrl }: CheckoutPayload = await req.json();

      if (!priceId || !userId) {
        return new Response(JSON.stringify({ error: "Missing priceId or userId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isSubscription = SUBSCRIPTION_PRICE_IDS.has(priceId);

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: isSubscription ? "subscription" : "payment",
        payment_method_types: isSubscription ? ["card"] : ["card", "blik", "p24"],
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: userId,
        customer_email: `${username?.toLowerCase() ?? "user"}@novactorio.io`,
        metadata: {
          user_id: userId,
          username: username ?? "unknown",
          price_id: priceId,
        },
        success_url: successUrl ?? "https://factoryworld.mmc29213.workers.dev/?checkout=success",
        cancel_url: cancelUrl ?? "https://factoryworld.mmc29213.workers.dev/?checkout=cancel",
      };

      if (isSubscription) {
        sessionParams.subscription_data = {
          metadata: {
            user_id: userId,
            username: username ?? "unknown",
            price_id: priceId,
          },
        };
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Stripe checkout error:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }),
};
