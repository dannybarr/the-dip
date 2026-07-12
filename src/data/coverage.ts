import type { Catalyst } from "@/lib/types";

/**
 * Coverage overlay — the analyst judgment layer that no market-data feed can
 * supply. For each covered name the desk authors a standing catalyst thesis
 * (how vulnerable the earnings power is, and how mean-reverting its dips tend to
 * be), moat and balance-sheet ratings, forward growth expectations, the 5y P/E
 * norm, short interest, the bull/bear case and a desk note. The live provider
 * fills price, technicals and current fundamentals from real data.
 *
 * Names are drawn from the market-data provider's free-tier coverage so the
 * whole universe resolves live. Catalyst copy is an evergreen desk read, not a
 * same-day news headline: it describes what a dip in this name usually means and
 * whether the desk treats one as opportunity or warning.
 */
export interface CoverageOverlay {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  catalyst: Catalyst;
  /** 1–5 competitive moat rating. */
  moat: number;
  /** 1–5 balance-sheet strength rating. */
  balanceSheet: number;
  /** Five-year average P/E — the valuation yardstick. */
  pe5yAvg: number;
  /** Forward revenue growth expectation, %. */
  revGrowthFwdPct: number;
  /** Forward EPS growth expectation, %. */
  epsGrowthFwdPct: number;
  /** Short interest as % of float. */
  shortInterestPct: number;
  bullCase: string[];
  bearCase: string[];
  deskNote: string;
  peers: string[];
}

/** Shorthand for the standing-thesis catalyst (no same-day date). */
function thesis(
  type: Catalyst["type"],
  headline: string,
  detail: string,
  severity: number,
  transience: number,
): Catalyst {
  return { type, headline, detail, date: "", severity, transience };
}

export const COVERAGE: CoverageOverlay[] = [
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    industry: "Consumer Electronics",
    catalyst: thesis(
      "competitive_threat",
      "Dips are usually AI-lag anxiety or China demand scares, rarely a break in the installed base",
      "Apple sells off on two recurring fears: that it is behind on generative AI, and that China is structurally lost. Neither has yet dented an installed base above two billion active devices or the services annuity riding on top of it. The desk treats hardware-cycle wobble as noise and a services deceleration as the only signal that matters.",
      3,
      7,
    ),
    moat: 5,
    balanceSheet: 5,
    pe5yAvg: 28,
    revGrowthFwdPct: 6,
    epsGrowthFwdPct: 10,
    shortInterestPct: 0.7,
    bullCase: [
      "Services is now a high-margin annuity compounding at double digits on a two-billion-device base",
      "Buyback of scale retires the share count through every drawdown",
      "Switching costs across the ecosystem remain effectively absolute",
    ],
    bearCase: [
      "Hardware growth is mature and increasingly replacement-driven",
      "Regulatory pressure on App Store economics is a real, slow tax",
      "A premium multiple leaves little room for an AI narrative miss",
    ],
    deskNote:
      "The highest-quality balance sheet in the index rarely goes on sale. When macro or China fear marks it down, the buyer is underwriting the ecosystem, not the next quarter's units.",
    peers: ["MSFT", "GOOGL", "AMZN"],
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corp.",
    sector: "Technology",
    industry: "Software — Infrastructure",
    catalyst: thesis(
      "guidance_cut",
      "Dips cluster around Azure growth prints and the capital intensity of the AI build-out",
      "Microsoft falls when Azure growth decelerates a point or two, or when the market recoils at the scale of AI capex. The earnings power sits on enterprise contracts that do not churn on a soft quarter. The desk watches Azure growth and Copilot attach as the real gauges, not the capex headline.",
      3,
      7,
    ),
    moat: 5,
    balanceSheet: 5,
    pe5yAvg: 31,
    revGrowthFwdPct: 13,
    epsGrowthFwdPct: 14,
    shortInterestPct: 0.6,
    bullCase: [
      "Azure plus Copilot is the clearest enterprise path to monetizing AI at scale",
      "Commercial bookings and remaining performance obligations give rare forward visibility",
      "Diversified across cloud, productivity and gaming, so no single miss is fatal",
    ],
    bearCase: [
      "AI capex is compressing free cash flow before the revenue fully arrives",
      "Azure decelerating toward the low twenties would reset the multiple",
      "Among the most expensive mega-caps on forward earnings",
    ],
    deskNote:
      "Enterprise software with contractual revenue and a fortress balance sheet. Dips driven by a single Azure print or a capex scare are where the desk adds to quality.",
    peers: ["GOOGL", "AMZN", "ADBE"],
  },
  {
    ticker: "GOOGL",
    name: "Alphabet Inc.",
    sector: "Communication Services",
    industry: "Internet Content & Information",
    catalyst: thesis(
      "competitive_threat",
      "The perennial fear is that AI search disrupts the world's best advertising machine",
      "Alphabet carries a discount for the fear that conversational AI erodes query volume and search economics. So far search revenue keeps growing while Cloud turns profitable and Gemini closes the model gap. The desk views recurring AI-disruption drawdowns as re-runs of a movie that has not yet changed its ending.",
      4,
      7,
    ),
    moat: 5,
    balanceSheet: 5,
    pe5yAvg: 24,
    revGrowthFwdPct: 11,
    epsGrowthFwdPct: 15,
    shortInterestPct: 0.8,
    bullCase: [
      "Search remains a structurally advantaged, high-margin cash engine",
      "Cloud has inflected to profit and is growing faster than the core",
      "Cheapest of the mega-cap platforms with optionality in Waymo and DeepMind",
    ],
    bearCase: [
      "AI answers could compress the most valuable commercial queries over time",
      "Antitrust remedies are a genuine overhang on distribution and defaults",
      "Capex intensity is rising to defend the AI frontier",
    ],
    deskNote:
      "A five-star franchise that trades at a market multiple because of a disruption fear it keeps outrunning. The desk is a buyer when that fear, not the numbers, sets the price.",
    peers: ["META", "MSFT", "AMZN"],
  },
  {
    ticker: "AMZN",
    name: "Amazon.com Inc.",
    sector: "Consumer Cyclical",
    industry: "Internet Retail",
    catalyst: thesis(
      "guidance_cut",
      "Dips come from retail-margin scares and AWS growth wobble, not a loss of position",
      "Amazon sells off on soft retail operating margin or a decelerating AWS print. The structural story, a widening AWS profit pool and a retail business finally harvesting years of logistics investment, stays intact through the quarterly noise. The desk underwrites the AWS trajectory and the retail margin path, not any single guide.",
      3,
      7,
    ),
    moat: 5,
    balanceSheet: 4,
    pe5yAvg: 42,
    revGrowthFwdPct: 11,
    epsGrowthFwdPct: 22,
    shortInterestPct: 0.8,
    bullCase: [
      "AWS is the profit engine and the best-positioned hyperscaler on backlog",
      "Retail margins are inflecting as fulfillment investment turns to leverage",
      "Advertising is a high-margin third pillar still early in monetization",
    ],
    bearCase: [
      "Consumer softness hits the retail top line quickly",
      "AWS competition from Azure and Google Cloud is intensifying",
      "Capex for AI infrastructure weighs on near-term free cash flow",
    ],
    deskNote:
      "Two dominant franchises inside one ticker. When the retail margin scares the tape, the buyer is really getting AWS and ads at a discount.",
    peers: ["MSFT", "GOOGL", "WMT"],
  },
  {
    ticker: "META",
    name: "Meta Platforms Inc.",
    sector: "Communication Services",
    industry: "Internet Content & Information",
    catalyst: thesis(
      "guidance_cut",
      "Dips are spending-fear drawdowns: the market recoils at AI and Reality Labs capex",
      "Meta's sell-offs are almost always about the cost line, not the revenue. The 2022 template still governs: when capex and Reality Labs losses spook the tape, the ad engine underneath keeps compounding on AI-driven engagement and pricing. The desk separates a spending scare, usually a buy, from genuine ad-demand weakness, which is not.",
      3,
      7,
    ),
    moat: 5,
    balanceSheet: 5,
    pe5yAvg: 23,
    revGrowthFwdPct: 15,
    epsGrowthFwdPct: 16,
    shortInterestPct: 1.1,
    bullCase: [
      "AI-ranked feeds and ad tools are lifting engagement and price per impression",
      "Roughly four billion users give unmatched reach and first-party data",
      "Management has proven it will cut costs hard when the market demands it",
    ],
    bearCase: [
      "Reality Labs remains a large, open-ended cash drain",
      "Ad revenue is cyclical and exposed to any macro pullback",
      "Regulatory and platform-access risk never fully clears",
    ],
    deskNote:
      "The cleanest recent example of the desk's thesis: the 2022 spending-fear dip resolved into a multi-fold recovery once costs were disciplined. Spending scares in this franchise are opportunities.",
    peers: ["GOOGL", "NFLX", "AAPL"],
  },
  {
    ticker: "NVDA",
    name: "NVIDIA Corp.",
    sector: "Technology",
    industry: "Semiconductors",
    catalyst: thesis(
      "sector_sympathy",
      "Dips are high-beta AI-cycle scares: any hint of a data-center digestion phase",
      "Nvidia swings on the market's confidence in the durability of AI capex. Any whisper of hyperscaler digestion, export controls or a competing accelerator triggers an outsized move given the beta. Demand visibility and software lock-in via CUDA remain exceptional. The desk sizes small and respects the volatility.",
      4,
      6,
    ),
    moat: 5,
    balanceSheet: 5,
    pe5yAvg: 40,
    revGrowthFwdPct: 30,
    epsGrowthFwdPct: 35,
    shortInterestPct: 1.2,
    bullCase: [
      "CUDA and the developer ecosystem are a software moat around the silicon",
      "Data-center demand visibility remains multiple quarters deep",
      "Full-stack systems position extends beyond the chip to the rack",
    ],
    bearCase: [
      "Any data-center digestion phase hits a high-multiple, high-beta name hard",
      "Customer concentration in a handful of hyperscalers is real",
      "Export controls and in-house accelerators threaten the long tail",
    ],
    deskNote:
      "The purest expression of the AI capital cycle, and the highest beta in coverage. Dips are violent and often mechanical. The desk buys the cycle, not the day, and keeps size honest.",
    peers: ["AMD", "MSFT", "META"],
  },
  {
    ticker: "AMD",
    name: "Advanced Micro Devices",
    sector: "Technology",
    industry: "Semiconductors",
    catalyst: thesis(
      "sector_sympathy",
      "Dips track the memory-and-accelerator cycle and every Nvidia comparison",
      "AMD trades as the high-beta challenger in AI compute and moves in sympathy with the whole semi complex. Its dips exaggerate sector fear because the AI-accelerator ramp is younger and less proven than the leader's. The desk weighs genuine data-center share gains against a valuation that already prices success.",
      5,
      6,
    ),
    moat: 3,
    balanceSheet: 4,
    pe5yAvg: 35,
    revGrowthFwdPct: 20,
    epsGrowthFwdPct: 30,
    shortInterestPct: 2.6,
    bullCase: [
      "MI-series accelerators give a credible second source in AI data center",
      "Server CPU share continues to take ground from the incumbent",
      "Chiplet design leadership underpins a structural cost advantage",
    ],
    bearCase: [
      "Trails Nvidia badly on the software ecosystem that locks in AI workloads",
      "Cyclical exposure to PC and gaming end-markets remains",
      "A rich multiple leaves no room for an accelerator-ramp stumble",
    ],
    deskNote:
      "A real share-gain story wrapped in a high-beta cyclical. Sympathy sell-offs in the semis are where a challenger like this overshoots to the downside.",
    peers: ["NVDA", "INTC", "AVGO"],
  },
  {
    ticker: "NFLX",
    name: "Netflix Inc.",
    sector: "Communication Services",
    industry: "Entertainment",
    catalyst: thesis(
      "earnings_miss",
      "Dips hinge on subscriber-add and margin prints now that the model has re-rated",
      "Netflix sells off when net adds or operating-margin guidance disappoint versus a bar that has climbed with the multiple. The paid-sharing and ad-tier levers turned it into a cash machine, but expectations are no longer cheap. The desk buys demonstrated pricing power on a wobble, not a hope trade.",
      4,
      6,
    ),
    moat: 4,
    balanceSheet: 4,
    pe5yAvg: 38,
    revGrowthFwdPct: 14,
    epsGrowthFwdPct: 22,
    shortInterestPct: 1.5,
    bullCase: [
      "Paid sharing and the ad tier unlocked a new leg of revenue and margin",
      "Clear leadership in scaled streaming with global content reach",
      "Free cash flow has inflected sharply as content spend normalizes",
    ],
    bearCase: [
      "Subscriber growth is maturing in developed markets",
      "Content arms race with deep-pocketed rivals never fully rests",
      "The multiple now demands consistent execution every quarter",
    ],
    deskNote:
      "The streaming war has a clear winner, and it now prints cash. But the market prices that. The desk wants a genuine subscriber scare, not a modest guide-down, before leaning in.",
    peers: ["DIS", "META", "GOOGL"],
  },
  {
    ticker: "ADBE",
    name: "Adobe Inc.",
    sector: "Technology",
    industry: "Software — Application",
    catalyst: thesis(
      "competitive_threat",
      "The standing fear: AI-native design tools cap the growth of a five-star franchise",
      "Adobe carries a recurring AI-disruption discount. Each drawdown assumes generative tools erode Creative Cloud, yet the prints keep showing no churn, no seat loss and Firefly monetization added to the ARR base. The desk treats narrative-driven gaps in this franchise as gifts until the numbers actually deteriorate.",
      3,
      7,
    ),
    moat: 5,
    balanceSheet: 5,
    pe5yAvg: 32,
    revGrowthFwdPct: 10,
    epsGrowthFwdPct: 13,
    shortInterestPct: 2.1,
    bullCase: [
      "High-80s gross margins and heavy free cash flow fund buybacks at the lows",
      "Firefly monetization is additive, already embedded in the ARR base",
      "Enterprise switching costs in Creative Cloud remain near absolute",
    ],
    bearCase: [
      "AI-native tools could compress the low end of the creative market over time",
      "Net-new ARR growth has decelerated across recent quarters",
      "The multiple can stay compressed while the AI narrative persists",
    ],
    deskNote:
      "This is the third AI-kills-Adobe drawdown in three years; the prior two resolved sharply higher. The desk buys zero fundamental deterioration dressed up as an existential threat.",
    peers: ["MSFT", "CRM", "GOOGL"],
  },
  {
    ticker: "TSLA",
    name: "Tesla Inc.",
    sector: "Consumer Cyclical",
    industry: "Auto Manufacturers",
    catalyst: thesis(
      "guidance_cut",
      "Dips swing between auto-margin compression and the value the tape assigns to autonomy",
      "Tesla is two stories in one price: a margin-pressured auto business and an unpriced bet on autonomy and energy. Delivery misses and price cuts drive the drawdowns; the optionality drives the recoveries. The desk keeps size disciplined because the volatility is structural and the valuation is a belief system.",
      6,
      5,
    ),
    moat: 3,
    balanceSheet: 5,
    pe5yAvg: 70,
    revGrowthFwdPct: 15,
    epsGrowthFwdPct: 20,
    shortInterestPct: 3.0,
    bullCase: [
      "Energy storage and the autonomy option are largely free in the auto multiple's shadow",
      "Manufacturing cost leadership in EVs remains a durable edge",
      "Net-cash balance sheet funds the roadmap without dilution",
    ],
    bearCase: [
      "Core auto margins are under real pressure from price cuts and competition",
      "The valuation rests on autonomy timelines that keep slipping",
      "Among the highest-beta large caps, brutal in a risk-off tape",
    ],
    deskNote:
      "A cyclical auto maker with a call option stapled on. The desk respects both the volatility and the balance sheet, and never sizes it like a compounder.",
    peers: ["GM", "F", "NVDA"],
  },
  {
    ticker: "JPM",
    name: "JPMorgan Chase & Co.",
    sector: "Financial Services",
    industry: "Banks — Diversified",
    catalyst: thesis(
      "macro",
      "Dips are macro and rate-driven: recession fear, credit worries, curve moves",
      "JPMorgan falls with the macro, on recession odds, net-interest-margin fear and credit-cycle worry. It is the best-run money-center bank, so its dips are usually the sector's beta rather than a franchise problem. The desk distinguishes a system-wide credit scare from bank-specific damage, and this name is rarely the latter.",
      4,
      6,
    ),
    moat: 3,
    balanceSheet: 4,
    pe5yAvg: 12,
    revGrowthFwdPct: 5,
    epsGrowthFwdPct: 7,
    shortInterestPct: 1.0,
    bullCase: [
      "Best operator among the money-center banks with a fortress balance sheet",
      "Scale and diversification cushion any single business cycle",
      "Returns capital heavily through buybacks and a growing dividend",
    ],
    bearCase: [
      "Earnings are geared to the credit cycle and net interest margin",
      "A genuine recession lifts loan-loss provisions quickly",
      "Regulatory capital requirements cap the through-cycle return",
    ],
    deskNote:
      "When the macro sells the banks, the highest-quality operator gets marked down with the group. The desk uses sector fear to own the best franchise in it.",
    peers: ["GS", "BAC", "WFC"],
  },
  {
    ticker: "GS",
    name: "Goldman Sachs Group",
    sector: "Financial Services",
    industry: "Capital Markets",
    catalyst: thesis(
      "macro",
      "Dips track capital-markets sentiment: deal drought fear and trading-revenue volatility",
      "Goldman moves with the pulse of capital markets. When the deal pipeline looks dry or markets seize, the tape marks it down hard; when activity thaws, the operating leverage snaps back. The desk buys the franchise into cyclical pessimism about a fee pool that always eventually returns.",
      4,
      6,
    ),
    moat: 3,
    balanceSheet: 4,
    pe5yAvg: 11,
    revGrowthFwdPct: 6,
    epsGrowthFwdPct: 12,
    shortInterestPct: 1.3,
    bullCase: [
      "Premier advisory and markets franchise with strong operating leverage to a recovery",
      "Retreat from consumer banking sharpens the return profile",
      "Trades at a modest multiple of tangible book with heavy buybacks",
    ],
    bearCase: [
      "Revenue is among the most cyclical in financials",
      "Trading results are inherently volatile quarter to quarter",
      "A prolonged deal drought pressures the fee engine",
    ],
    deskNote:
      "A high-quality cyclical on the fee pool of global capital markets. Deal-drought pessimism is the setup the desk wants, not the one it fears.",
    peers: ["JPM", "BAC", "WFC"],
  },
  {
    ticker: "UNH",
    name: "UnitedHealth Group",
    sector: "Healthcare",
    industry: "Healthcare Plans",
    catalyst: thesis(
      "regulatory",
      "Dips are medical-cost and policy scares: utilization spikes and reimbursement risk",
      "UnitedHealth sells off on rising medical-loss ratios and headline policy risk to Medicare Advantage. The vertically integrated model through Optum usually absorbs cost shocks a pure insurer cannot. The desk separates a transient utilization quarter from a genuine reimbursement-rate reset, and only the latter changes the thesis.",
      5,
      6,
    ),
    moat: 4,
    balanceSheet: 4,
    pe5yAvg: 20,
    revGrowthFwdPct: 8,
    epsGrowthFwdPct: 11,
    shortInterestPct: 0.9,
    bullCase: [
      "Optum vertical integration is a structural edge over pure-play insurers",
      "Scale in Medicare Advantage compounds with an aging population",
      "Long record of double-digit earnings growth through cycles",
    ],
    bearCase: [
      "Medical-cost inflation can compress margins faster than pricing adjusts",
      "Medicare Advantage rates and policy are a standing political target",
      "Headline and regulatory risk can overwhelm fundamentals near-term",
    ],
    deskNote:
      "A compounder that occasionally trades like a broken stock on a cost or policy scare. The desk buys the integrated model when utilization fear, not a rate cut, does the selling.",
    peers: ["JNJ", "PFE", "ABBV"],
  },
  {
    ticker: "JNJ",
    name: "Johnson & Johnson",
    sector: "Healthcare",
    industry: "Drug Manufacturers — General",
    catalyst: thesis(
      "regulatory",
      "Dips are litigation headlines and patent-cliff worry against a defensive base",
      "J&J drops on litigation overhangs and periodic patent-cliff anxiety. The diversified pharma and medtech base, plus a rare triple-A-adjacent balance sheet, makes the dividend and cash flow durable. The desk views legal-headline dips in a defensive compounder as the market overpaying for certainty it will get anyway.",
      3,
      7,
    ),
    moat: 4,
    balanceSheet: 5,
    pe5yAvg: 16,
    revGrowthFwdPct: 4,
    epsGrowthFwdPct: 6,
    shortInterestPct: 0.8,
    bullCase: [
      "Diversified pharma and medtech smooths any single product cycle",
      "One of the strongest balance sheets in the market funds a dividend aristocrat",
      "Defensive cash flows hold up when the cycle turns",
    ],
    bearCase: [
      "Litigation overhangs recur and are hard to size",
      "Top-line growth is pedestrian versus higher-beta healthcare",
      "Patent cliffs on key drugs require constant pipeline replacement",
    ],
    deskNote:
      "Defensive ballast that goes on sale when a legal headline hits. The desk is happy to be paid a growing dividend to wait out a settlement.",
    peers: ["PFE", "ABBV", "UNH"],
  },
  {
    ticker: "PFE",
    name: "Pfizer Inc.",
    sector: "Healthcare",
    industry: "Drug Manufacturers — General",
    catalyst: thesis(
      "structural_decline",
      "Dips reflect the post-COVID revenue cliff and real doubt about the pipeline",
      "Pfizer's drawdowns are about a genuine problem: replacing the COVID windfall and proving the pipeline and acquisitions can carry growth. This is closer to a value situation than a compounder on sale. The desk demands a real margin of safety and treats the high dividend yield as compensation for a slow turnaround, not a free lunch.",
      6,
      5,
    ),
    moat: 3,
    balanceSheet: 3,
    pe5yAvg: 11,
    revGrowthFwdPct: 2,
    epsGrowthFwdPct: 6,
    shortInterestPct: 1.4,
    bullCase: [
      "Deeply out of favor with a high dividend yield paying you to wait",
      "Oncology acquisitions could seed the next growth leg",
      "Cost program supports earnings while the top line stabilizes",
    ],
    bearCase: [
      "The post-COVID revenue reset is real and not fully lapped",
      "Pipeline productivity must prove it can replace lost revenue",
      "Balance sheet carries elevated deal-funded leverage",
    ],
    deskNote:
      "A turnaround, not a compounder. The desk only engages with a wide margin of safety and clear evidence the pipeline is filling the COVID hole.",
    peers: ["JNJ", "ABBV", "UNH"],
  },
  {
    ticker: "NKE",
    name: "Nike Inc.",
    sector: "Consumer Cyclical",
    industry: "Footwear & Accessories",
    catalyst: thesis(
      "guidance_cut",
      "Dips are turnaround-execution scares: inventory, China, and a bloated wholesale reset",
      "Nike sells off on demand softness, China weakness and the messy reset of its direct-to-consumer and wholesale mix. The brand is generational; the near-term execution is genuinely in question. The desk separates a brand in permanent decline, which this is not, from a brand mid-turnaround, which it is.",
      4,
      6,
    ),
    moat: 4,
    balanceSheet: 4,
    pe5yAvg: 28,
    revGrowthFwdPct: 4,
    epsGrowthFwdPct: 10,
    shortInterestPct: 2.2,
    bullCase: [
      "One of the strongest consumer brands in the world with global pricing power",
      "Inventory and wholesale reset sets up an eventual margin recovery",
      "Balance sheet and buyback support the shares through the trough",
    ],
    bearCase: [
      "The turnaround is multi-quarter with real China and demand risk",
      "Competition from newer performance brands has taken share",
      "Margins remain pressured until the channel reset completes",
    ],
    deskNote:
      "A generational brand caught mid-reset. The desk buys turnaround execution risk in a durable franchise, not a structural loss of the brand.",
    peers: ["SBUX", "TGT", "COST"],
  },
  {
    ticker: "SBUX",
    name: "Starbucks Corp.",
    sector: "Consumer Cyclical",
    industry: "Restaurants",
    catalyst: thesis(
      "guidance_cut",
      "Dips follow same-store-sales misses in the US and China amid a live turnaround",
      "Starbucks drops on negative comparable sales and China competition, with a new operating agenda promising a throughput and brand reset. The loyalty program and global footprint are real assets; the execution is unproven quarter to quarter. The desk treats comp-driven dips as opportunities only while the brand equity holds.",
      4,
      6,
    ),
    moat: 4,
    balanceSheet: 3,
    pe5yAvg: 26,
    revGrowthFwdPct: 5,
    epsGrowthFwdPct: 11,
    shortInterestPct: 2.0,
    bullCase: [
      "Dominant global coffee brand with a deep loyalty and rewards moat",
      "Turnaround plan targets throughput, staffing and menu simplification",
      "International whitespace remains despite China competition",
    ],
    bearCase: [
      "US comps have turned negative and the recovery is unproven",
      "China faces intense, price-aggressive local competition",
      "Leverage limits flexibility if the turnaround stalls",
    ],
    deskNote:
      "A premium brand working through a genuine operating slump. The desk wants evidence the comp trajectory is turning before treating a dip as a gift.",
    peers: ["NKE", "MCD", "TGT"],
  },
  {
    ticker: "DIS",
    name: "The Walt Disney Company",
    sector: "Communication Services",
    industry: "Entertainment",
    catalyst: thesis(
      "guidance_cut",
      "Dips pit streaming losses and linear decline against parks strength and a content library",
      "Disney sells off when streaming profitability slips or linear TV decline accelerates, offset by a parks business that prints cash. The turnaround, streaming to sustained profit and a content-led ROI reset, is real but lumpy. The desk underwrites the sum of the parts against a price that often reflects only the problems.",
      4,
      6,
    ),
    moat: 4,
    balanceSheet: 4,
    pe5yAvg: 22,
    revGrowthFwdPct: 5,
    epsGrowthFwdPct: 14,
    shortInterestPct: 1.4,
    bullCase: [
      "Parks and experiences are a durable, high-return cash engine",
      "Streaming has crossed into profitability after heavy investment",
      "Unmatched IP library underpins pricing power across segments",
    ],
    bearCase: [
      "Linear TV decline is structural and still a large profit base",
      "Streaming margins remain thin versus the legacy bundle",
      "Content and succession execution risk is elevated",
    ],
    deskNote:
      "A sum-of-the-parts story where parks fund the streaming transition. The desk buys the franchise when the market prices the decline and ignores the cash engine.",
    peers: ["NFLX", "META", "CMCSA"],
  },
  {
    ticker: "PYPL",
    name: "PayPal Holdings Inc.",
    sector: "Financial Services",
    industry: "Credit Services",
    catalyst: thesis(
      "competitive_threat",
      "Dips reflect margin compression and share-loss fear as competition crowds checkout",
      "PayPal falls on transaction-margin compression and the fear that Apple Pay, Shop Pay and others are eroding branded checkout. It is a genuine value-versus-value-trap debate: real cash flow and buybacks against decelerating engagement. The desk demands proof that branded checkout and Braintree margins are stabilizing before leaning in.",
      6,
      5,
    ),
    moat: 2,
    balanceSheet: 4,
    pe5yAvg: 24,
    revGrowthFwdPct: 7,
    epsGrowthFwdPct: 9,
    shortInterestPct: 2.5,
    bullCase: [
      "Large, cash-generative payments network trading at a low multiple",
      "Aggressive buyback shrinks the share count at depressed prices",
      "Venmo and branded checkout still hold meaningful engagement",
    ],
    bearCase: [
      "Branded-checkout share is under real competitive pressure",
      "Transaction margins have compressed as mix shifts to Braintree",
      "The moat is the thinnest in coverage, hence the value-trap risk",
    ],
    deskNote:
      "The classic value-versus-value-trap. Cheapness alone is not a thesis here; the desk needs stabilizing margins and engagement before the low multiple becomes an opportunity.",
    peers: ["V", "COIN", "JPM"],
  },
  {
    ticker: "COIN",
    name: "Coinbase Global Inc.",
    sector: "Financial Services",
    industry: "Financial — Capital Markets",
    catalyst: thesis(
      "sector_sympathy",
      "Dips are crypto-beta and regulatory scares, amplified by the leverage to volumes",
      "Coinbase is a leveraged bet on crypto activity and the regulatory backdrop. Falling token prices and volumes, or a hostile enforcement headline, drive violent drawdowns; the recoveries are just as sharp. The desk sizes this as a high-risk cyclical, never a core holding, and respects that the tape can halve or double.",
      6,
      5,
    ),
    moat: 2,
    balanceSheet: 4,
    pe5yAvg: 30,
    revGrowthFwdPct: 20,
    epsGrowthFwdPct: 25,
    shortInterestPct: 6.0,
    bullCase: [
      "The most trusted US-regulated on-ramp with a growing subscription revenue mix",
      "Custody, staking and stablecoin revenue diversify away from trading fees",
      "Structural winner if crypto adoption and clearer regulation continue",
    ],
    bearCase: [
      "Revenue is highly geared to crypto prices and trading volumes",
      "Regulatory outcomes remain a binary, existential-scale risk",
      "Elevated short interest signals crowded skepticism",
    ],
    deskNote:
      "A pure high-beta cyclical on crypto activity. The desk treats every dip as a trade with hard risk limits, not a compounder to accumulate.",
    peers: ["PYPL", "V", "GS"],
  },
  {
    ticker: "XOM",
    name: "Exxon Mobil Corp.",
    sector: "Energy",
    industry: "Oil & Gas Integrated",
    catalyst: thesis(
      "macro",
      "Dips track the oil price: demand-destruction fear and every OPEC and recession headline",
      "Exxon moves with crude and the macro. Recession fear, demand-destruction narratives and OPEC supply headlines drive the drawdowns; the integrated model and low-cost reserves drive the through-cycle returns. The desk buys the best-capitalized major into commodity pessimism, not into a euphoric oil spike.",
      5,
      6,
    ),
    moat: 3,
    balanceSheet: 4,
    pe5yAvg: 12,
    revGrowthFwdPct: 2,
    epsGrowthFwdPct: 5,
    shortInterestPct: 0.9,
    bullCase: [
      "Integrated model and low-cost Permian and Guyana barrels defend returns",
      "Strong balance sheet funds a resilient, growing dividend through the cycle",
      "Disciplined capital allocation after years of over-investment across the sector",
    ],
    bearCase: [
      "Earnings are ultimately a function of a commodity price it cannot control",
      "Energy transition is a long-term demand overhang",
      "Dips can persist as long as the oil tape stays weak",
    ],
    deskNote:
      "A commodity cyclical with a fortress balance sheet. The desk owns the strongest major when demand fear, not a supply shock, sets the price.",
    peers: ["CVX", "GE", "BA"],
  },
  {
    ticker: "BA",
    name: "The Boeing Company",
    sector: "Industrials",
    industry: "Aerospace & Defense",
    catalyst: thesis(
      "regulatory",
      "Dips are execution and safety crises against an effectively irreplaceable order book",
      "Boeing's drawdowns come from production quality, safety investigations and cash burn, set against a duopoly order backlog stretching years out. The demand is not the question; execution and the balance sheet are. The desk treats this as a special situation, buying the recovery only when free cash flow and delivery rates inflect.",
      6,
      5,
    ),
    moat: 4,
    balanceSheet: 2,
    pe5yAvg: 30,
    revGrowthFwdPct: 12,
    epsGrowthFwdPct: 40,
    shortInterestPct: 1.6,
    bullCase: [
      "Half of an effective global duopoly with a multi-year order backlog",
      "Deliveries and free cash flow inflecting off a deeply depressed base",
      "Defense and services provide a more stable earnings ballast",
    ],
    bearCase: [
      "Balance sheet is stretched after years of cash burn",
      "Production quality and regulatory scrutiny remain unresolved",
      "Any fresh safety event resets the recovery timeline",
    ],
    deskNote:
      "A special situation, not a clean compounder. The desk engages only on evidence that delivery rates and cash flow are turning, and sizes for the balance-sheet risk.",
    peers: ["GE", "XOM", "CVX"],
  },
  {
    ticker: "WMT",
    name: "Walmart Inc.",
    sector: "Consumer Defensive",
    industry: "Discount Stores",
    catalyst: thesis(
      "guidance_cut",
      "Dips are rare and usually margin-mix or guidance wobble in a defensive compounder",
      "Walmart seldom dips hard; when it does it is margin-mix worry or a cautious guide, not a demand problem. The scale flywheel, grocery traffic plus a fast-growing advertising and marketplace layer, keeps compounding. The desk treats any pullback in this defensive grower as a chance to own consistency it rarely discounts.",
      2,
      8,
    ),
    moat: 4,
    balanceSheet: 4,
    pe5yAvg: 28,
    revGrowthFwdPct: 5,
    epsGrowthFwdPct: 10,
    shortInterestPct: 0.7,
    bullCase: [
      "Scale and grocery traffic drive a widening advertising and marketplace profit pool",
      "Defensive demand base holds up through consumer downturns",
      "Automation and e-commerce leverage are lifting structural margins",
    ],
    bearCase: [
      "A premium multiple for a low-growth retailer leaves little slack",
      "Retail margins are thin and sensitive to mix and wage inflation",
      "E-commerce investment is a persistent cost to defend share",
    ],
    deskNote:
      "A defensive compounder that rarely goes on sale. When a margin or guidance wobble marks it down, the desk is a willing buyer of the consistency.",
    peers: ["COST", "TGT", "AMZN"],
  },
  {
    ticker: "TGT",
    name: "Target Corp.",
    sector: "Consumer Defensive",
    industry: "Discount Stores",
    catalyst: thesis(
      "earnings_miss",
      "Dips are discretionary-mix and margin misses that hit harder than at defensive peers",
      "Target's heavier discretionary mix makes its earnings swing more than Walmart's when the consumer trades down or inventory misjudges demand. The brand and store base are strong; the execution has been inconsistent. The desk buys the franchise on a margin-reset scare, provided traffic and inventory discipline are recovering.",
      4,
      6,
    ),
    moat: 3,
    balanceSheet: 4,
    pe5yAvg: 17,
    revGrowthFwdPct: 3,
    epsGrowthFwdPct: 9,
    shortInterestPct: 3.0,
    bullCase: [
      "Strong brand and owned-label assortment support a loyal customer base",
      "Margin recovery leverage as inventory and mix normalize",
      "Trades at a clear discount to its defensive-retail peer",
    ],
    bearCase: [
      "Discretionary mix amplifies earnings volatility versus Walmart",
      "Execution and inventory management have been inconsistent",
      "Traffic can soften quickly when the consumer retrenches",
    ],
    deskNote:
      "The more cyclical of the big-box operators, which is exactly why its dips overshoot. The desk buys the brand on a margin scare once discipline is visibly returning.",
    peers: ["WMT", "COST", "NKE"],
  },
];

export const COVERAGE_TICKERS: string[] = COVERAGE.map((c) => c.ticker);

export const OVERLAY_BY_TICKER: Record<string, CoverageOverlay> = Object.fromEntries(
  COVERAGE.map((c) => [c.ticker, c]),
);
