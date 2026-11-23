// Static word lists, patterns and host tables for the rule linter in
// shared/lint.ts. Everything here is structural: the linter never fetches,
// resolves or pings a URL.

/** Short titles for each check, shown wherever only the id is stored. */
export const CHECK_TITLES: Record<string, string> = {
  "comparator-without-number": "Comparison without a number",
  "rules-identical": "Two rules are identical",
  "subjective-judge": "A person decides the outcome",
  "url-shortener": "Shortened source link",
  "url-not-public-host": "Source is not a public host",
  "closes-too-soon": "Closes within an hour",
  "threshold-boundary": "Unclear whether the exact threshold counts",
  "rule-gap": "NO rule may not cover every other result",
  "vague-term": "Vague wording",
  "event-date-missing": "No event date or period",
  "date-without-year": "Month without a year",
  "timezone-missing": "No time zone",
  "close-after-event": "Trading closes after the result may be public",
  "no-publication-deadline": "No deadline for a missing publication",
  "outage-unhandled": "Source outage not handled",
  "revision-unspecified": "Revised figures: vintage not named",
  "postponement-unhandled": "Postponement not handled",
  "multiple-sources": "Several possible sources",
  "source-not-in-rule": "YES rule does not name the source",
  "self-reference": "Depends on this market itself",
  "question-not-binary": "Question is not yes-or-no",
  "url-placeholder": "Placeholder source link",
  "url-social": "Social media source",
  "url-search-page": "Search results as source",
  "url-secret-param": "Source link carries a secret",
  "closes-too-far": "Closes more than two years out",
  "publication-lag": "Publication lag",
  "close-before-event": "Closes well before the event",
  "invalid-refund-wording": "INVALID pays half, not a refund",
  "source-host-mismatch": "Source name and link differ",
};

export interface Agency {
  /** Registrable host; its subdomains match too. */
  host: string;
  /** Lower-case names that identify the agency in a draft's sourceName. */
  names: readonly string[];
  /** Days after the reference period ends until the figure is published. */
  lagDays: number;
  /** Whether published figures are later revised. */
  revisable: boolean;
  /** Series published on a different lag than the agency default. */
  series?: readonly { pattern: RegExp; lagDays: number }[];
}

// ponytail: static table; extend by pull request, not runtime config
// Lags checked on 2026-11-22 against each agency's published calendar; the
// values stay at or above the longest observed lag so warnings err quiet.
export const AGENCIES: readonly Agency[] = [
  // bls.gov/schedule/news_release/cpi.htm: CPI for Oct 2026 to Nov 2027 is
  // released 10 to 14 days after the month ends. Unconfirmed: the jobs
  // report's lag (expected shorter, about one week).
  {
    host: "bls.gov",
    names: ["bureau of labor statistics", "bls"],
    lagDays: 15,
    revisable: true,
  },
  // bea.gov/news/schedule/full: 2026 advance GDP estimates came 29 to 30
  // days after the quarter (Apr 30, Jul 30, Oct 29). The Q4 2025 advance
  // estimate slipped to Feb 20 (51 days), so treat 30 as typical, not a cap.
  {
    host: "bea.gov",
    names: ["bureau of economic analysis", "bea"],
    lagDays: 30,
    revisable: true,
  },
  // MoSPI advance release calendar 2026-27: all-India CPI on the 12th of the
  // next month (next working day on holidays); Q2 FY2026-27 GDP on 30 Nov
  // 2026, 61 days after the quarter. Read from a search summary of the
  // September 2026 calendar PDF; the PDF itself could not be read.
  {
    host: "mospi.gov.in",
    names: ["ministry of statistics", "mospi"],
    lagDays: 15,
    revisable: true,
    series: [{ pattern: /\bgdp\b/i, lagDays: 62 }],
  },
  // Unconfirmed: RBI policy decisions are announced on the decision day; the
  // RBI calendar was not checked.
  {
    host: "rbi.org.in",
    names: ["reserve bank of india", "rbi"],
    lagDays: 0,
    revisable: false,
  },
  // federalreserve.gov/monetarypolicy/fomccalendars.htm lists the 2026
  // meeting dates. Unconfirmed: the page does not state that the statement
  // is published on the meeting's final day.
  {
    host: "federalreserve.gov",
    names: ["federal reserve", "fomc"],
    lagDays: 0,
    revisable: false,
  },
  // ecb.europa.eu/press/calendars/mgcgc: each monetary policy meeting ends on
  // day 2 with a press conference.
  {
    host: "ecb.europa.eu",
    names: ["european central bank", "ecb"],
    lagDays: 0,
    revisable: false,
  },
];

export const SHORTENER_HOSTS = [
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "cutt.ly",
  "rb.gy",
];
export const SOCIAL_HOSTS = [
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "reddit.com",
  "t.me",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "linkedin.com",
];
/** Host labels of search engines; a search page on any of them warns. */
export const SEARCH_ENGINES = [
  "google",
  "bing",
  "duckduckgo",
  "yahoo",
  "yandex",
  "baidu",
];
export const PRIVATE_SUFFIXES = [
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  ".localhost",
];
export const PLACEHOLDER_HOSTS = ["example.com", "example.org", "example.net"];
export const PLACEHOLDER_SUFFIXES = [".example", ".test", ".invalid"];
export const SECRET_PARAM =
  /^(?:token|key|api[-_]?key|sig|signature|auth|authorization|session|session[-_]?id|sid|password|passwd|pwd|secret|access[-_]?token|x-amz-signature|x-goog-signature)$/i;
/** Host labels too generic to identify a source in a rule. */
export const GENERIC_HOST_LABELS = [
  "www",
  "gov",
  "org",
  "com",
  "co",
  "ac",
  "net",
  "edu",
  "nic",
  "data",
  "api",
  "docs",
  "app",
];
/** Source-name words too generic to identify a source in a rule. */
export const STOP_WORDS = [
  "the",
  "and",
  "for",
  "from",
  "with",
  "official",
  "source",
  "sources",
  "data",
  "report",
  "reports",
  "website",
  "page",
  "news",
  "inc",
  "ltd",
  "llc",
  "yearly",
  "annual",
  "monthly",
  "daily",
];

// Patterns are non-global; shared/lint.ts adds the g flag where it iterates.
const MONTH =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";

export const COMPARATOR =
  /\b(?:above|below|over|under|exceed\w*|more than|less than|fewer than|greater than|at least|at most|reach\w*|hits?|surpass\w*|higher|lower\w*|ris(?:e|es|ing|en)|rose|fall(?:s|ing|en)?|fell)\b/i;
export const NUMBER =
  /\d|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion|trillion|half|double|twice|triple)\b/i;
export const THRESHOLD =
  /\b(?:above|below|over|under|exceed(?:s|ed|ing)?|(?:more|less|fewer|greater|higher|lower) than)\s+(?:(?:US\$|USD|INR|Rs\.?|₹|\$|€|£)\s*)?\d[\d,.]*(?:\s*(?:%|k\b|m\b|bn\b|percent\b|points?\b))?/i;
export const BOUNDARY =
  /\b(?:at least|at most|or more|or higher|or above|or less|or lower|or below|or fewer|or greater|strictly|inclusive|exclusive|equal to)\b|[≥≤]|>=|<=/i;
export const NO_LABEL =
  /\b(?:resolves?|resolved|settles?|settled)(?:\s+(?:as|to))?\s+["'“‘]?no\b["'”’]?|(?:^|[.;:]\s*)no\s*[:\-–—]/i;
export const CATCH_ALL =
  /\b(?:otherwise|any other|any value|anything else|not|no|none|never|fail(?:s|ed|ing)?)\b|n['’]t\b/i;
export const VAGUE =
  /\b(?:significant(?:ly)?|substantial(?:ly)?|major|widely|roughly|approximately|around|about|soon|recently|many|several|few|popular|successful|credible|reputable|mainstream|considerable|notable|might|could)\b/i;
/** Lower-case "may" is the modal; "May" is the month. */
export const MODAL_MAY = /\bmay\b(?!\s*,?\s*\d)/;

export const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})/;
export const MONTH_DAY_YEAR = new RegExp(
  `\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
  "i",
);
export const DAY_MONTH_YEAR = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH},?\\s+(\\d{4})\\b`,
  "i",
);
export const MONTH_YEAR = new RegExp(`\\b${MONTH},?\\s+(\\d{4})\\b`, "i");
export const QUARTER_YEAR = /\bQ([1-4])\s*(?:of\s+)?(?:FY\s*)?(\d{4})\b/i;
export const YEAR_PHRASE =
  /\b(in|during|throughout|by|before|until|end of|start of)\s+(\d{4})\b/i;
export const YEAR = /\b(?:19|20)\d{2}\b/;
/** A day without a year, for the time-zone check. */
export const DAY_LEVEL = new RegExp(
  `\\b\\d{4}-\\d{2}-\\d{2}|\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`,
  "i",
);
export const MONTH_NAME =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b|\b[Ee]nd of the (?:month|quarter)\b/;
export const CLOCK =
  /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.)(?!\w)|\b(?:midnight|noon|end of (?:the )?(?:day|trading day|business day)|market close|close of (?:business|trading))\b/i;
/** Abbreviations are case-sensitive so "et al." is not Eastern Time. */
export const ZONE_ABBREVIATION =
  /\b(?:UTC|GMT|IST|ET|EST|EDT|PT|PST|PDT|CT|CST|CDT|CET|CEST|BST|JST|AEST|AEDT|SGT|HKT)\b|\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s?Z\b|(?:^|[\sT(])[+-]\d{2}:\d{2}\b/;
export const ZONE_WORDS =
  /\b(?:coordinated universal time|(?:eastern|pacific|central|mountain|india|indian|greenwich mean|central european)\s+(?:standard\s+|daylight\s+)?time|local time in)\b/i;
export const DURATION =
  /\b(?:\d+|one|two|three|four|five|six|seven|ten|fourteen|thirty|sixty|ninety)\s+(?:business\s+|calendar\s+|working\s+)?(?:hours?|days?|weeks?|months?)\b/i;
export const OUTAGE =
  /\b(?:unavailab\w*|not\s+(?:be\s+)?(?:publish\w*|releas\w*|availab\w*|post\w*|issued)|n['’]t\s+(?:publish\w*|releas\w*|post\w*)|fail\w*\s+to\s+(?:publish|release|report|post)|discontinu\w*|delay\w*|missing|offline|outage\w*|no\s+longer\s+\w+|cease\w*|suspend\w*|withdraw\w*)/i;
export const REVISION_TRIGGER =
  /\b(?:estimates?|estimated|preliminary|advance|flash|provisional)\b/i;
export const VINTAGE =
  /\b(?:first|initial|original)\s+(?:[\w-]+\s+){0,3}?(?:release|publication|print|reading|estimate|figure|report)\b|\bas\s+(?:first|initially|originally)\s+(?:published|released|reported)\b|\brevisions?\s+(?:do|does|will|shall)\s+not\b|\b(?:later|subsequent|future)\s+revisions?\b|\bregardless\s+of\s+(?:any\s+)?revisions?\b|\b(?:advance|second|third)\s+estimate\b|\bvintage\b/i;
export const SCHEDULED_EVENT =
  /\b(?:match(?:es)?|games?|elections?|votes?|launch(?:es)?|meetings?|ipos?|flights?|ceremon(?:y|ies))\b/i;
export const POSTPONEMENT =
  /\b(?:postpon\w*|cancel\w*|delay\w*|reschedul\w*|abandon\w*|called off)\b/i;
/** "Reuters or Bloomberg reports": names are case-sensitive capitals. */
export const NAMED_ALTERNATIVES =
  /\b[A-Z][\w.&'-]*(?:\s+[A-Z][\w.&'-]*)*\s+or\s+(?:the\s+)?[A-Z][\w.&'-]*(?:\s+[A-Z][\w.&'-]*)*\s+(?:reports?|reported|announces?|announced|publish(?:es|ed)?|confirms?|confirmed|states?|says|said|shows?|lists?)\b/;
export const OPEN_SOURCES =
  /\band\/or\b|\bany\s+(?:(?:major|reputable|credible|mainstream|reliable|national|international)\s+)?(?:news\s+)?(?:outlets?|media|publications?|newspapers?|websites?|sources?|news)\b|\b(?:news|media|press)\s+reports?\b|\b(?:multiple|several|other)\s+(?:sources|outlets)\b/i;
export const SELF_REFERENCE =
  /\b(?:this market(?:['’]s)?|wildcatter|trading volume|(?:the\s+)?market(?:['’]s)?\s+(?:probability|odds))\b/i;
export const SUBJECTIVE_JUDGE =
  /\bin\s+(?:the\s+)?(?:market\s+)?(?:creator['’]?s?['’]?|our|my|organi[sz]er['’]?s)\s+(?:sole\s+|own\s+)?(?:opinion|judge?ment|view|assessment)\b|\bat\s+(?:the|my|our)\s+(?:sole\s+)?discretion\b|\bas\s+(?:determined|decided|judged)\s+by\s+(?:the\s+)?(?:market\s+)?creator\b|\b(?:i|we)\s*(?:will|shall|['’]ll)\s+(?:decide|determine|judge)\b|\bthe\s+(?:market\s+)?creator\s+(?:decides|determines|judges)\b/i;
export const BINARY_START =
  /^\W*(?:will|is|does|has|did|are|was|can|do|have|were|should|would|could)\b/i;
export const CHOICE =
  /\bor\b(?!\s+(?:more|higher|above|less|lower|below|greater|fewer|later|earlier|not|equal|before|after|beyond)\b)/i;
export const REFUND = /\brefund\w*/i;
