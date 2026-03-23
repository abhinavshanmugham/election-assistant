const express = require("express");
const cors = require("cors");

const parties = require("./src/data/parties.js").default || require("./src/data/parties.js");
const cms = require("./src/data/cms.js").default || require("./src/data/cms.js");
const leaders =
  require("./src/data/leaders.js").default || require("./src/data/leaders.js");

const STOP_WORDS = [
  "what",
  "who",
  "is",
  "the",
  "in",
  "of",
  "for",
  "please",
  "tell",
  "me",
  "show",
  "about",
  "a",
  "an"
];

const tokenize = (input) => {
  const text = String(input || "").toLowerCase();
  const rawTokens = text.split(/[^a-z]+/).filter(Boolean);
  return rawTokens.filter((t) => !STOP_WORDS.includes(t));
};

const detectIntent = (tokens) => {
  const joined = tokens.join(" ");

  if (joined.includes("parties")) return "list_parties";
  if (joined.includes("flag")) return "flag";
  if (joined.includes("symbol")) return "symbol";
  if (joined.includes("leader")) return "leader";
  if (joined.includes("slogan") || joined.includes("motto")) return "slogan";
  if (joined.includes("cm") || joined.includes("chief minister")) return "cm";
  if (joined.includes("prime minister") || joined === "pm") return "pm";

  return "party_info";
};



const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/chat", (req, res) => {
  const { query } = req.body || {};
  const tokens = tokenize(query);

  if (!tokens.length) {
    return res.json({
      text: "Please ask an election-related question."
    });
  }

  const intent = detectIntent(tokens);

  if (intent === "list_parties") {
    const partyNames = parties.map((p) => `- ${p.name}`).join("\n");
    return res.json({ text: `The major parties in Tamil Nadu are:\n${partyNames}` });
  }

  const party = parties.find((p) => {
    const partyTokens = [
      p.name.toLowerCase(),
      ...(p.aliases || []).map((a) => a.toLowerCase())
    ];
    return tokens.some((t) =>
      partyTokens.some((pt) => pt.split(" ").includes(t) || pt === t)
    );
  });

  if (party) {
    if (intent === "flag") {
      return res.json({ text: `${party.name} Flag`, image: party.flag });
    }
    if (intent === "symbol") {
      return res.json({ text: `${party.name} Symbol`, image: party.symbol });
    }
    if (intent === "leader") {
      return res.json({ text: `${party.name} Leader: ${party.leader}` });
    }
    if (intent === "slogan") {
      const parts = [];
      if (party.sloganEn) {
        parts.push(party.sloganEn);
      }
      if (party.sloganTa) {
        parts.push(party.sloganTa);
      }
      const text =
        parts.length > 0
          ? parts.join("\n")
          : `I don't have a stored slogan for ${party.name}.`;
      return res.json({ text });
    }

    const detailLines = [`Party: ${party.name}`, `Leader: ${party.leader}`];
    if (party.sloganEn) detailLines.push(party.sloganEn);
    if (party.sloganTa) detailLines.push(party.sloganTa);

    return res.json({
      text: detailLines.join("\n"),
      image: party.flag
    });
  }

  if (intent === "cm") {
    const joinedStr = tokens.join("");
    const matchingState = Object.keys(cms).find((state) =>
      joinedStr.includes(state.toLowerCase().replace(/\s+/g, ""))
    );

    if (matchingState) {
      return res.json({
        text: `Chief Minister of ${matchingState}: ${cms[matchingState]}`
      });
    }
    return res.json({
      text:
        "I could not detect the state. Please ask like: 'Who is the CM of Tamil Nadu?'."
    });
  }

  if (intent === "pm") {
    return res.json({
      text: `Prime Minister of India: ${leaders["prime minister"]}`
    });
  }

  return res.json({
    text:
      "I am trained for Indian election questions. Ask about party flags, symbols, slogans, leaders, CMs, or the Prime Minister."
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Election assistant backend running on port ${PORT}`);
});

