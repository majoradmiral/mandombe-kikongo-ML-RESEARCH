import { Crown, BookOpen, Headphones, ScrollText, Infinity as InfinityIcon, Languages } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const features = [
  { icon: BookOpen, label: "Full vocabulary with 500+ words" },
  { icon: ScrollText, label: "Complete bilingual stories" },
  { icon: Headphones, label: "Audio pronunciations" },
  { icon: Crown, label: "Advanced Kilolaka modules" },
];

const PremiumSection = () => {
  const { user, isPremium } = useAuth();
  const navigate = useNavigate();

  const handleClick = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (isPremium) {
      try {
        const { data, error } = await supabase.functions.invoke("customer-portal");
        if (error) throw error;
        if (data?.url) window.open(data.url, "_blank");
      } catch (err) {
        console.error("Portal error:", err);
      }
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err) {
      console.error("Checkout error:", err);
    }
  };

  if (isPremium) {
    return (
      <section id="premium" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto bg-gradient-to-br from-gold/10 to-gold/5 rounded-2xl p-12 text-center border border-gold/30">
            <div className="w-16 h-16 rounded-full bg-gold/20 flex items-center justify-center mx-auto mb-6">
              <Crown className="w-8 h-8 text-gold" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              You're a Premium Member! 🎉
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto mb-8 text-lg">
              You have full access to all content. Enjoy your learning journey!
            </p>
            <button
              onClick={handleClick}
              className="bg-gold hover:bg-gold/90 text-earth-deep px-8 py-3 rounded-lg font-bold transition-colors"
            >
              Manage Subscription
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="premium" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-earth-deep to-earth-deep/90 rounded-2xl p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/10 rounded-full translate-y-1/3 -translate-x-1/4" />

          <div className="relative z-10">
            <div className="w-16 h-16 rounded-full bg-gold/20 flex items-center justify-center mx-auto mb-6">
              <Crown className="w-8 h-8 text-gold" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-cream mb-4">
              Unlock the Full Experience
            </h2>
            <p className="text-cream/70 max-w-lg mx-auto mb-10 text-lg">
              Get unlimited access to all lessons, stories, audio, and the complete
              Kilolaka cosmological guide.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 max-w-md mx-auto mb-10">
              {features.map((f) => (
                <div key={f.label} className="flex items-center gap-3 text-left text-cream/80">
                  <f.icon className="w-5 h-5 text-gold flex-shrink-0" />
                  <span className="text-sm">{f.label}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch">
              <button
                onClick={handleClick}
                className="bg-gold hover:bg-gold/90 text-earth-deep px-8 py-4 rounded-lg text-base font-bold transition-colors inline-flex items-center justify-center gap-2"
              >
                <Crown className="w-5 h-5" /> Go Premium — $9.99/month
              </button>
              <button
                onClick={async () => {
                  if (!user) {
                    navigate("/auth?next=/translator");
                    return;
                  }
                  try {
                    const { data, error } = await supabase.functions.invoke("create-lifetime-checkout");
                    if (error) throw error;
                    if (data?.url) window.open(data.url, "_blank");
                  } catch (err) {
                    console.error(err);
                    toast.error("Erreur lors de la création du paiement");
                  }
                }}
                className="border border-gold/50 text-cream hover:bg-gold/10 px-8 py-4 rounded-lg text-base font-bold transition-colors inline-flex items-center justify-center gap-2"
              >
                <InfinityIcon className="w-5 h-5 text-gold" /> Lifetime Translator + Dictionary — $19.99
              </button>
            </div>
            <p className="text-cream/50 text-sm mt-4">
              Premium: cancel anytime, full access. Lifetime: one-time payment, forever access to translator & dictionary.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PremiumSection;
