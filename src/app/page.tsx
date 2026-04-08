import WaitlistForm from "./waitlist-form";

export default function WaitlistPublicPage() {
  const tcTextPt =
    process.env.WAITLIST_TC_TEXT_PT ||
    "Ao submeter este formulário, aceita ser contactado sobre a disponibilidade de lugares de estacionamento na Rua da Torrinha, Porto. Os seus dados pessoais serão tratados de acordo com o RGPD e utilizados apenas para este fim.";
  const tcTextEn =
    process.env.WAITLIST_TC_TEXT_EN ||
    "By submitting this form, you agree to be contacted about parking spot availability at Rua da Torrinha, Porto. Your personal data will be processed in accordance with GDPR and used solely for this purpose.";
  const contactEmail = process.env.OWNER_EMAIL || "";

  return (
    <WaitlistForm
      tcTextPt={tcTextPt}
      tcTextEn={tcTextEn}
      contactEmail={contactEmail}
    />
  );
}
