# 🌐 BiomarkerFinder Frontend (Webflow Embeds)

This folder contains the HTML and JavaScript code used in the **Webflow frontend** of BiomarkerFinder.
The live site is hosted at [https://www.pharmatools.ai/biomarker-matchmaker](https://www.pharmatools.ai/biomarker-matchmaker).

## 📁 Files
- **01-title.html** – header and intro badge
- **02-how-it-works.html** – explanation of workflow steps
- **03-tool.html** – main interactive biomarker finder tool (connects to Firebase backend)
- **04-faq.html** – frequently asked questions section

## 💡 Usage
These files can be tested locally in a browser or imported into Webflow via the **Embed Code** element.

To test locally:
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000/frontend/03-tool.html` in your browser.

## 🧠 Note
- All backend calls in `03-tool.html` point to Firebase Functions endpoints (replace with your dev URLs if needed).
- No API keys are exposed.
- Contributions (UI tweaks, accessibility, animations) are welcome via pull requests.
