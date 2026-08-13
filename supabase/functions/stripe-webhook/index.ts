import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

function tierFromPriceId(priceId: string): string {
  if (priceId === "price_1TYW6EK4E5IHLVVAW4SaLTXU") return "starter";
  if (priceId === "price_1TYW9LK4E5IHLVVAZrXNVjWk") return "premium";
  return "free";
}

console.info("stripe-webhook started");

export default {
  fetch: async (req: Request) => {
    try {
      const signature = req.headers.get("stripe-signature");
      if (!signature) {
        return new Response("Missing stripe-signature", { status: 400 });
      }

      const body = await req.text();
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.user_id;
          const username = session.metadata?.username;
          const priceId = session.metadata?.price_id ?? "";
          const isSubscription = session.mode === "subscription";

          if (!userId) {
            console.error("No user_id in session metadata");
            break;
          }

          // Record payment
          await supabase.from("payments").insert({
            user_id: userId,
            username: username ?? "unknown",
            stripe_session_id: session.id,
            amount: session.amount_total ? session.amount_total / 100 : 0,
            currency: session.currency ?? "pln",
            tier: isSubscription ? tierFromPriceId(priceId) : "free",
            price_id: priceId,
            status: "completed",
          });

          // For subscriptions, upgrade profile tier
          if (isSubscription) {
            const tier = tierFromPriceId(priceId);
            await supabase.from("profiles").upsert({
              id: userId,
              username: username ?? "unknown",
              premium_tier: tier,
              premium_updated_at: new Date().toISOString(),
            });
            console.log(`Subscription completed for ${username ?? userId}: ${tier}`);
          } else {
            console.log(`One-time purchase completed for ${username ?? userId}: ${priceId}`);
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const uid = subscription.metadata?.user_id;

          if (uid) {
            await supabase.from("profiles").update({
              premium_tier: "free",
              premium_updated_at: new Date().toISOString(),
            }).eq("id", uid);

            console.log(`Subscription cancelled for user ${uid}`);
          }
          break;
        }

        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          const subId = invoice.subscription as string;
          if (subId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(subId);
              const uid = subscription.metadata?.user_id;
              if (uid) {
                await supabase.from("profiles").update({
                  premium_updated_at: new Date().toISOString(),
                }).eq("id", uid);
              }
            } catch {
              // subscription might not exist
            }
          }
          break;
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Webhook error:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
