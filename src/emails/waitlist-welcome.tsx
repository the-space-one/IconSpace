import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface WaitlistWelcomeEmailProps {
  /** Product name, doubles as the wordmark and closing signature. */
  brand: string;
}

/** Absolute origin for the logo. Mail clients have no page to resolve a
 *  relative path against, so this has to be fully qualified.
 *
 *  Resolved rather than hard-coded because the same template renders from three
 *  places: production, a Vercel preview deployment, and `npm run email`. A
 *  literal production URL breaks the local preview and silently ships a broken
 *  image whenever the asset has not been deployed yet.
 *
 *  Points at the static file in `public/`, never at `/_next/image` — an
 *  optimiser round trip would bill a transformation for every recipient. */
const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const WaitlistWelcomeEmail = ({ brand }: WaitlistWelcomeEmailProps) => (
  <Html>
    <Head />
    <Preview>{`You are on the ${brand} waitlist`}</Preview>
    <Body style={body}>
      <Container align="left" style={container}>
        <Section>
          <Img
            src={`${baseUrl}/mascot.png`}
            width="48"
            height="43"
            alt={brand}
          />
        </Section>

        <Text style={hero}>Welcome to {brand}</Text>
        <Text style={paragraph}>Hey, thanks for joining the waitlist.</Text>
        <Text style={paragraph}>
          We&apos;ve saved your spot and we&apos;ll notify you the moment{" "}
          {brand} goes live.
        </Text>

        <Text style={signature}>- The {brand} team</Text>
      </Container>
    </Body>
  </Html>
);

WaitlistWelcomeEmail.PreviewProps = {
  brand: "Icon Space",
} satisfies WaitlistWelcomeEmailProps;

export default WaitlistWelcomeEmail;

const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const body: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: 0,
  padding: "40px 0",
  fontFamily: fontStack,
  color: "#1a1a1a",
};

const container: React.CSSProperties = {
  margin: 0,
  padding: "0 24px",
  maxWidth: "440px",
};

const hero: React.CSSProperties = {
  margin: "28px 0 0",
  fontSize: "22px",
  fontWeight: 600,
  color: "#1a1a1a",
};

const paragraph: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: "15px",
  lineHeight: "24px",
  color: "#444444",
};

const signature: React.CSSProperties = {
  margin: "28px 0 0",
  fontSize: "12px",
  lineHeight: "18px",
  fontWeight: 600,
  color: "#8E94FD",
};
