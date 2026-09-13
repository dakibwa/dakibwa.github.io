import { CONTACT_WHATSAPP_NUMBER, CONTACT_WHATSAPP_URL } from "@/lib/config";

export function TermsPrivacyInformation() {
  return (
    <div className="policy-information">
      <h2>How booking works</h2>
      <ul>
        <li><strong>Book your time.</strong> Choose your lessons and check the price before confirming. Nothing is charged at booking.</li>
        <li><strong>Pay after each lesson.</strong> If you save a card, Stripe charges it automatically when each lesson ends. Otherwise, pay Inês on the lesson day.</li>
        <li><strong>Move or cancel.</strong> Use your calendar before the lesson starts. It’s free until the day before; on the lesson day, it costs €5 once per lesson. All deadlines use Porto time.</li>
        <li><strong>If you miss a lesson.</strong> A no-show recorded by Inês costs €5 instead of the lesson price. Any earlier €5 change fee still applies.</li>
      </ul>
      <p>
        Moving keeps the lesson price due; cancelling removes it. Saved-card fees are charged automatically.
        There is no change fee if Inês moves or cancels. Complete any card setup to receive your confirmation.
        Prepaid bookings keep the rules shown in your calendar.
      </p>
      <p>
        Repeating lessons are paid separately. An ongoing booking repeats until you stop it in your calendar;
        stopping keeps any lesson booked for today.
      </p>
      <p>
        <strong>Lessons Inês adds.</strong> You’ll receive an email to confirm the lesson and its price.
        You can use your saved card or add one securely. If you choose to allow future lessons, Inês can
        add them with payment after each lesson. Turn this off in your calendar at any time; lessons
        already confirmed keep their agreed payment.
      </p>
      <p>
        <strong>Your cancellation rights.</strong> You have 14 days after booking online to exercise your
        statutory right to withdraw, or longer where the law requires. Email Inês with your name and booking
        reference; she handles these requests personally. Where statutory withdrawal rights apply, the usual
        €5 cancellation fee does not apply, and any refund legally due must be made within 14 days of your notice.
      </p>
      <p>
        Lessons are provided by Inês Dias Baía (Português com a Inês), NIF 248899945.
        Business address: Época, Rua do Rosário, 22, Porto, Portugal.
        Contact <a href="mailto:aprenderportugues.ines@gmail.com">aprenderportugues.ines@gmail.com</a> or
        {" "}<a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">{CONTACT_WHATSAPP_NUMBER} (WhatsApp)</a> about
        bookings, payments, refunds, complaints or your data. Your statutory consumer rights are unaffected by these terms.
        {" "}<a href="https://cicap.pt/">CICAP, Porto’s consumer arbitration centre</a>, can help with eligible consumer disputes.
      </p>

      <h2>Your privacy</h2>
      <p>
        Inês is responsible for your personal information. Acknowledging this notice does not give consent
        to marketing or optional data use.
      </p>
      <p>
        <strong>What we use.</strong> Your name, email, sign-in details, time zone and booking history are
        needed for your account, lessons and booking messages. Without these details, online booking cannot
        work. Your phone number and lesson notes are optional.
      </p>
      <p>
        <strong>Why.</strong> We use this information to fulfil our agreement with you, meet
        financial record-keeping duties and protect the service from misuse or disputes (our legitimate
        interests).
      </p>
      <p>
        <strong>How long.</strong> Account and booking records stay in your account history until you ask
        Inês to close it or delete them. Financial records normally need to be kept for 10 years under
        Portuguese tax law; records needed for outstanding payments or disputes may be kept until those
        are resolved. These duties can limit deletion.
      </p>
      <p>
        <strong>Service providers.</strong> Cloudflare hosts the site and records; Resend sends emails;
        Google handles optional sign-in and email correspondence; Stripe handles card payments. We never
        store full card details. Browser storage supports sign-in, security and checkout; there is no advertising analytics.
      </p>
      <p>
        Providers may process data outside the EEA, including in the US. Their transfer terms describe EU
        adequacy decisions, including the EU–US Data Privacy Framework, and EU standard contractual clauses
        where applicable. Details and safeguards: <a href="https://www.cloudflare.com/cloudflare-customer-dpa/">Cloudflare</a>,
        {" "}<a href="https://resend.com/legal/dpa">Resend</a>, <a href="https://policies.google.com/privacy/frameworks?hl=en">Google</a> and
        {" "}<a href="https://stripe.com/privacy">Stripe</a>. You can also request copies from Inês.
      </p>
      <p>
        <strong>Your rights.</strong> You can request access, correction, deletion or transfer of your data,
        restrict its use or object by contacting Inês above. Some records must be kept by law. You can complain to Portugal’s data
        protection authority, the <a href="https://www.cnpd.pt/">CNPD</a>.
      </p>
    </div>
  );
}
