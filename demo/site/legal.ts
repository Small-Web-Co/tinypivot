/**
 * The privacy policy and terms of service, as content for the Legal page.
 * Each statement describes what the code does today: change them together.
 * The privacy policy follows packages/mcp/src/telemetry.ts, api/telemetry.ts, api/webhook.ts,
 * api/create-checkout.ts, api/ai-proxy.ts and demo/main.ts.
 */

export interface LegalSection {
  heading: string
  paragraphs?: string[]
  items?: string[]
}

export interface LegalDocument {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
}

export const LEGAL_CONTACT = 'license@tiny-pivot.com'

const contact = `Questions or requests: email ${LEGAL_CONTACT}.`

export const privacyPolicy: LegalDocument = {
  title: 'Privacy policy',
  updated: 'November 27, 2026',
  intro: 'Small Web, LLC ("we") makes TinyPivot: the TinyPivot MCP server and Studio, the TinyPivot React and Vue libraries, and the tiny-pivot.com website. This page says what data each of them sends to us or to others, and what stays on your computer.',
  sections: [
    {
      heading: 'Your data stays on your computer',
      paragraphs: [
        'The TinyPivot MCP server runs on your computer. The files, rows, columns, SQL and database results you work with are read and processed there. TinyPivot Studio is served from your own computer (127.0.0.1) and is not reachable from other machines. Saved pulls are kept in your local data folder (~/.local/share/tinypivot by default) for 30 days, unless you change or turn off history, and your preferences in ~/.config/tinypivot.',
        'What your AI agent sends to its model provider is between you and that provider: TinyPivot gives the agent a short summary of each result, not the rows.',
      ],
    },
    {
      heading: 'Anonymous usage statistics from the MCP server',
      paragraphs: [
        'Unless you turn it off, the MCP server sends a small usage event to tiny-pivot.com when it is set up, when it starts, when a tool is used, or when a Pro-gated feature is hit. Events are stored in a Postgres database hosted by Neon. Each event holds only:',
      ],
      items: [
        'the event type (init, server start, tool call, or feature gate), the tool or feature name, and whether it succeeded or hit a fixed error category (such as "file_parse" — never raw error text or stack traces)',
        'the number of rows, as a range such as "100-1k"',
        'the name of the AI agent that runs TinyPivot (for example "claude-code" or "opencode")',
        'your plan (free or pro), whether the result was cut to the free-tier limit, the TinyPivot version and your operating system',
        'a random ID created on your computer, not linked to your name, email or license',
        'the country our hosting provider derives from the request, and the time',
      ],
    },
    {
      heading: 'What usage events never contain',
      paragraphs: [
        'Events never contain row values, column names, SQL, file names or paths, or your license key. Turn them off with TINYPIVOT_TELEMETRY=0 or DO_NOT_TRACK=1.',
      ],
    },
    {
      heading: 'Downloads',
      paragraphs: [
        'Installing or starting TinyPivot through npx downloads it from the npm registry, and the first SQL query downloads the DuckDB engine from the same registry. npm, Inc. receives those requests under its own privacy policy.',
      ],
    },
    {
      heading: 'Licenses and payments',
      paragraphs: [
        'When you buy a license, payment is handled by Stripe, which receives your payment details and email address; we never see your card number. We receive your email address, the plan you bought and the payment status, and email your license key to you through our email provider, Resend. License keys are checked on your computer. Yearly MCP keys run to the end of the year you paid for: in a key\'s last month (daily for Team keys) the MCP server sends the key to tiny-pivot.com, which checks the subscription with Stripe and returns a renewed key. Team keys also send a one-way hash of the install, made from the license and a random ID on your computer, so we can tell the buyer when more people use a key than it covers; it cannot be traced to you, your machine or the usage statistics, and we keep only the last 30 days of them, on the Stripe subscription. Set TINYPIVOT_LICENSE_REFRESH=0 to turn this off; the key then works until its end date.',
      ],
    },
    {
      heading: 'The tiny-pivot.com website',
      items: [
        'We count page views with Vercel Web Analytics, which does not use cookies.',
        'The live demo asks our server for a short-lived demo token. Our server sees your IP address to limit how often tokens are requested.',
        'If you use the demo\'s AI analyst, the messages you write and the sample data it works on are sent through our server to a third-party AI model provider to produce the answer. Do not enter personal or confidential information there.',
        'Our hosting provider, Vercel, keeps server logs, including IP addresses, for a short time.',
      ],
    },
    {
      heading: 'The React and Vue libraries',
      paragraphs: [
        'The libraries run inside your own application and send nothing to us. If you set up their AI analyst, it talks to the AI provider and endpoint you configure, with your own key.',
      ],
    },
    {
      heading: 'Sharing, retention and your rights',
      paragraphs: [
        'We do not sell personal data or use it for advertising. We share it only with the providers named above, to run the service, or when the law requires it. We keep purchase records as long as tax and accounting law requires, and anonymous usage statistics as long as they help us improve TinyPivot.',
        `You can ask to see, correct or delete the personal data we hold about you. ${contact}`,
      ],
    },
    {
      heading: 'Changes',
      paragraphs: [
        'When this policy changes, we update this page and its date. Material changes are also noted in the release notes.',
      ],
    },
  ],
}

export const termsOfService: LegalDocument = {
  title: 'Terms of service',
  updated: 'November 27, 2026',
  intro: 'These terms apply when you use TinyPivot, made by Small Web, LLC ("we"): the TinyPivot MCP server and Studio, the TinyPivot React and Vue libraries, plugins and extensions that install them, and the tiny-pivot.com website.',
  sections: [
    {
      heading: 'The software license',
      paragraphs: [
        'Your rights to use, copy and change the software are set by the license published with it in the GitHub repository (LICENSE.md). If these terms and that license disagree about the software, the license wins.',
      ],
    },
    {
      heading: 'Paid plans',
      paragraphs: [
        'Pro and Team plans unlock the features described on the pricing page. Yearly plans renew until you cancel; a lifetime or one-time license does not renew. A license key is for the person or team that bought it: do not publish or resell it. A Team key covers up to five people; if more use it, we will ask you to add seats, but we will not switch it off for that. We may revoke a key that was shared publicly or obtained by fraud. Payments are processed by Stripe. For a billing problem or a refund request, email us.',
      ],
    },
    {
      heading: 'Your data and your agent',
      paragraphs: [
        'You are responsible for the data you load into TinyPivot and for having the right to use it. TinyPivot shows and summarises data for your AI agent; the agent, its model provider and what they do with that summary are outside our control. Check important figures before relying on them.',
      ],
    },
    {
      heading: 'Acceptable use',
      paragraphs: [
        'Do not use TinyPivot or the website to break the law, to attack or overload our servers, to get around license checks or rate limits, or to misuse the demo\'s AI analyst.',
      ],
    },
    {
      heading: 'No warranty',
      paragraphs: [
        'TinyPivot is provided "as is", without warranties of any kind, to the extent the law allows. We do not promise that it will be uninterrupted, error-free or fit for a particular purpose.',
      ],
    },
    {
      heading: 'Limitation of liability',
      paragraphs: [
        'To the extent the law allows, we are not liable for indirect or consequential losses, lost profits or lost data, and our total liability is limited to what you paid us in the twelve months before the claim.',
      ],
    },
    {
      heading: 'Changes and contact',
      paragraphs: [
        'We may update these terms; the date above shows the latest version, and continuing to use TinyPivot after a change means you accept it.',
        contact,
      ],
    },
  ],
}
