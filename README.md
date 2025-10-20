# 🧬 BiomarkerFinder — Open Targets Hackathon 2025

**AI-powered biomarker discovery and explanation tool** built on top of the [Open Targets Platform](https://platform.opentargets.org/).
This project aims to make biomarker data more accessible and explainable for non-experts by combining structured evidence from Open Targets with generative AI and optional voice interaction.

---

## 🚀 Overview

BiomarkerFinder retrieves biomarkers linked to a selected disease, classifies them (diagnostic, prognostic, predictive, pharmacodynamic), and generates short, human-readable explanations of their roles in cancer and other diseases.

During the **Open Targets Hackathon 2025**, we're expanding the tool to include:

- 📊 Evidence and citation visualisation
- 💊 Drug-association view (approved vs clinical compounds)
- 🧬 Cross-disease comparison mode
- 🔊 Voice assistant integration (ElevenLabs)
- 💡 Enhanced AI summarisation and explainability
- 📤 Export and sharing features

Live prototype: [https://www.pharmatools.ai/biomarker-matchmaker](https://www.pharmatools.ai/biomarker-matchmaker)

Hackathon issue: [Open Targets Hackathon — Project #16](https://github.com/opentargets/hackathon-tasks/issues/16)

---

## 🧩 Tech Stack

| Layer | Technology |
|-------|-------------|
| **Backend** | Firebase Functions (Node.js) |
| **Data Source** | Open Targets GraphQL API |
| **AI Summarisation** | OpenAI GPT-4 / Gemini |
| **Voice (optional)** | ElevenLabs API |
| **Frontend** | Webflow / React / JavaScript |
| **Visualisation** | D3.js / Cytoscape.js |

---

## ⚙️ Quick Start

### 1️⃣ Clone the repository
```bash
git clone https://github.com/nickjlamb/biomarkerfinder-hackathon.git
cd biomarkerfinder-hackathon/functions
```

### 2️⃣ Install dependencies
```bash
npm install
```

### 3️⃣ Configure environment variables

Create a `.env` file or set Firebase config values:
```bash
OPENAI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
```
(Do not commit these keys.)

### 4️⃣ Run locally or deploy test functions
```bash
firebase deploy --only functions
```

---

## 🧠 Project Structure

```
biomarkerfinder-hackathon/
│
├── functions/                 # Firebase backend
│   ├── index.js               # Main function entry
│   ├── package.json
│   ├── .gitignore
│   └── ...
│
├── README.md
└── LICENSE (Apache-2.0)
```

---

## 🧑‍🤝‍🧑 Contributing

We've created 8 sub-issues on the Hackathon Board — covering AI, voice, visualisation, docs, and more.

To join in:
1. Comment on an issue you'd like to work on (or suggest your own).
2. Fork this repo or request collaborator access.
3. Create a new branch for your contribution.
4. Open a pull request and tag @nickjlamb for review.

---

## 🔖 License

This project is released under the **Apache 2.0 License**, in line with the Open Targets Hackathon requirements.

---

## 🏁 Acknowledgements

Developed by **Nick Lamb** (@nickjlamb) and contributors for the **Open Targets Hackathon 2025**.

Thanks to the Open Targets team and all hackathon participants for their collaboration and data infrastructure.
