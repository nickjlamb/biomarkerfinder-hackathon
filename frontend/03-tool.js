    // DOM element references
    const input = document.getElementById("diseaseInput");
    const output = document.getElementById("output");
    const btn = document.getElementById("getBiomarkersBtn");
    const buttonText = document.getElementById("buttonText");
    const loadingSpinner = document.getElementById("loadingSpinner");
    const recentSearchTags = document.querySelectorAll(".recent-search-tag");
    const autocompleteList = document.getElementById("autocomplete-list");
    const searchIcon = document.querySelector(".input-icon");
    const micBtn = document.getElementById("micBtn");
    const clearBtn = document.getElementById("clearBtn");
    const soundWave = document.getElementById("soundWave");
    const voiceSelector = document.getElementById("voiceSelector");
    const voiceSummaryContainer = document.getElementById("voiceSummaryContainer");
    const voiceSummaryDisease = document.getElementById("voiceSummaryDisease");
    const voiceSummaryText = document.getElementById("voiceSummaryText");
    const voiceSummaryAudio = document.getElementById("voiceSummaryAudio");
    const copyVoiceSummary = document.getElementById("copyVoiceSummary");
    const relatedQuestions = document.getElementById("relatedQuestions");
    const relatedQuestionsChips = document.getElementById("relatedQuestionsChips");

    // Voice recognition setup
    let recognition;
    let selectedVoiceId = "21m00Tcm4TlvDq8ikWAM"; // Default: Rachel

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        input.value = transcript;
        micBtn.classList.remove('listening');
        if (soundWave) soundWave.style.display = 'none';
        // Show clear button and hide search icon when voice input is set
        if (clearBtn && searchIcon) {
          clearBtn.classList.add('show');
          searchIcon.classList.add('hide');
        }
        // Automatically trigger search with voice input
        searchBiomarkers(transcript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        micBtn.classList.remove('listening');
        if (soundWave) soundWave.style.display = 'none';

        let errorMessage = 'Voice input error. ';
        if (event.error === 'no-speech') {
          errorMessage += 'No speech detected. Please try again.';
        } else if (event.error === 'not-allowed') {
          errorMessage += 'Microphone access denied. Please enable it in your browser settings.';
        } else {
          errorMessage += 'Please try typing instead.';
        }
        alert(errorMessage);
      };

      recognition.onend = () => {
        micBtn.classList.remove('listening');
        if (soundWave) soundWave.style.display = 'none';
      };
    }

    // Mic button click handler
    if (micBtn) {
      micBtn.addEventListener('click', () => {
        if (recognition) {
          if (micBtn.classList.contains('listening')) {
            // Stop listening if already active
            recognition.stop();
            micBtn.classList.remove('listening');
            if (soundWave) soundWave.style.display = 'none';
          } else {
            // Start listening
            micBtn.classList.add('listening');
            if (soundWave) soundWave.style.display = 'flex';
            try {
              recognition.start();
            } catch (error) {
              console.error('Error starting recognition:', error);
              micBtn.classList.remove('listening');
              if (soundWave) soundWave.style.display = 'none';
            }
          }
        } else {
          alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
        }
      });
    }

    // Voice selector change handler
    if (voiceSelector) {
      voiceSelector.addEventListener('change', (e) => {
        selectedVoiceId = e.target.value;
        console.log('Selected voice:', selectedVoiceId);
      });
    }

    // Clear button functionality
    if (clearBtn && searchIcon) {
      // Show/hide clear button and search icon based on input value
      input.addEventListener('input', () => {
        if (input.value.trim()) {
          clearBtn.classList.add('show');
          searchIcon.classList.add('hide');
        } else {
          clearBtn.classList.remove('show');
          searchIcon.classList.remove('hide');
        }
      });

      // Clear input when clicked
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.remove('show');
        searchIcon.classList.remove('hide');
        autocompleteList.style.display = 'none';
        input.focus();
      });
    }

    // @risg99 - Start of Cytoscape references (toggleBtn is added dynamically in results)
    // Note: toggleBtn, cyContainer, and visualControls are created dynamically in search results
    // @risg99 - End of Cytoscape references

    let diseaseNames = [];

    // @risg99 - Start of Prefill functionality call
    window.addEventListener("DOMContentLoaded", async () => {
      const params = new URLSearchParams(window.location.search);
      const disease = params.get("disease");
      if (disease) {
        const decodedDisease = decodeURIComponent(disease);
        input.value = decodedDisease;
        await searchBiomarkers(decodedDisease); // run search automatically
      }
    });
    // @risg99 - End of Prefill functionality call

    // Convert markdown to HTML
    function markdownToHtml(text) {
      if (!text) return '';

      // Convert **bold** to <strong>bold</strong>
      text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

      // Convert *italic* to <em>italic</em>
      text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

      // Convert line breaks to <br>
      text = text.replace(/\n/g, '<br>');

      return text;
    }

    // Fetch and display voice summary
    async function fetchVoiceSummary(diseaseName, customQuestion = null) {
      try {
        const question = customQuestion || `What are the key biomarkers for ${diseaseName}?`;

        const response = await fetch("https://us-central1-biomarker-matchmaker.cloudfunctions.net/askBiomarkerVoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: question,
            voiceId: selectedVoiceId
          })
        });

        const data = await response.json();

        if (data.error) {
          console.error("Voice summary error:", data.error);
          return;
        }

        // Display voice summary
        voiceSummaryDisease.textContent = `AI Voice Summary for ${data.disease}`;
        voiceSummaryText.innerHTML = markdownToHtml(data.text);

        // Convert base64 audio to blob and play
        const audioBlob = base64ToBlob(data.audio, 'audio/mpeg');
        const audioUrl = URL.createObjectURL(audioBlob);
        voiceSummaryAudio.src = audioUrl;

        // Show the voice summary container
        voiceSummaryContainer.style.display = 'block';

        // Show related questions
        showRelatedQuestions(data.disease);

        // Auto-play the audio
        setTimeout(() => {
          voiceSummaryAudio.play().catch(err => {
            console.log('Autoplay prevented:', err);
            // User can manually click play if autoplay is blocked
          });
        }, 300);

      } catch (error) {
        console.error("Error fetching voice summary:", error);
      }
    }

    // Helper function to convert base64 to blob
    function base64ToBlob(base64, mimeType) {
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: mimeType });
    }

    // Generate and display related questions
    function showRelatedQuestions(diseaseName) {
      const questionTemplates = [
        `Which biomarkers are most strongly associated with ${diseaseName}?`,
        `How do these biomarkers affect disease progression in ${diseaseName}?`,
        `Are any of these biomarkers used to predict treatment response in ${diseaseName}?`,
        `Which drugs target these biomarkers in ${diseaseName}?`,
        `How reliable are these biomarkers for early diagnosis of ${diseaseName}?`,
        `What molecular mechanisms link these biomarkers to ${diseaseName}?`
      ];

      // Randomly select 3 questions
      const shuffled = questionTemplates.sort(() => 0.5 - Math.random());
      const selectedQuestions = shuffled.slice(0, 3);

      // Clear previous questions
      relatedQuestionsChips.innerHTML = '';

      // Create chips for each question
      selectedQuestions.forEach(question => {
        const chip = document.createElement('div');
        chip.className = 'related-question-chip';
        chip.textContent = question;
        chip.dataset.disease = diseaseName; // Store disease name for search
        chip.dataset.question = question; // Store full question for voice API
        chip.addEventListener('click', () => {
          input.value = chip.dataset.disease; // Use disease name for input
          searchBiomarkers(chip.dataset.disease, chip.dataset.question); // Pass question to voice API
        });
        relatedQuestionsChips.appendChild(chip);
      });

      // Show the related questions section
      relatedQuestions.style.display = 'block';
    }

    // Copy voice summary to clipboard
    if (copyVoiceSummary) {
      copyVoiceSummary.addEventListener('click', async () => {
        const textToCopy = `Disease: ${voiceSummaryDisease.textContent.replace('AI Voice Summary for ', '')}\n\nAnswer:\n${voiceSummaryText.textContent}\n\n---\nGenerated by BiomarkerFinder Voice Assistant`;

        try {
          await navigator.clipboard.writeText(textToCopy);

          // Visual feedback
          const originalIcon = copyVoiceSummary.innerHTML;
          copyVoiceSummary.innerHTML = '<i class="fas fa-check"></i>';
          copyVoiceSummary.classList.add('copied');

          setTimeout(() => {
            copyVoiceSummary.innerHTML = originalIcon;
            copyVoiceSummary.classList.remove('copied');
          }, 2000);
        } catch (error) {
          console.error('Failed to copy:', error);
        }
      });
    }

    // Fetch and process the disease list
    async function fetchDiseases() {
      try {
        const response = await fetch('https://gist.githubusercontent.com/nickjlamb/ead9c82885eb568ed5b8868c5faa0e29/raw/combined_diseases.json');
        const data = await response.json();
        diseaseNames = data.data.search.hits.map(hit => hit.object.name);
      } catch (error) {
        console.error("Failed to load disease list:", error);
      }
    }

    // Display autocomplete suggestions
    function displaySuggestions(matches) {
      if (matches.length > 0) {
        const html = matches.map(match => `<div class="suggestion-item">${match}</div>`).join('');
        autocompleteList.innerHTML = html;
        autocompleteList.style.display = 'block';
      } else {
        autocompleteList.style.display = 'none';
      }
    }

    // Event listener for input
    input.addEventListener("input", () => {
      const value = input.value.toLowerCase();
      if (!value) {
        autocompleteList.style.display = 'none';
        return;
      }
      const matches = diseaseNames.filter(disease => disease.toLowerCase().includes(value)).slice(0, 10);
      displaySuggestions(matches);
    });

    // Event listener for clicking on a suggestion
    autocompleteList.addEventListener("click", (e) => {
      if (e.target.classList.contains("suggestion-item")) {
        input.value = e.target.textContent;
        autocompleteList.style.display = 'none';
      }
    });

    // Close autocomplete when clicking elsewhere
    document.addEventListener("click", (e) => {
      if (e.target.id !== 'diseaseInput') {
        autocompleteList.style.display = 'none';
      }
    });

    // @risg99 - Start of Updated Click event for recent search tags to reuse same function with prefill
    recentSearchTags.forEach(tag => {
      tag.addEventListener("click", () => {
        const diseaseName = tag.textContent;
        input.value = diseaseName;
        searchBiomarkers(diseaseName);
      });
    });
    // @risg99 - End of Updated Click event for recent search tags to reuse same function with prefill

    // Enter key event for search input
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (autocompleteList.style.display === 'block') {
          autocompleteList.style.display = 'none';
        } else {
          searchBiomarkers();
        }
      }
    });

    // Click event for search button
    btn.addEventListener("click", searchBiomarkers);

    // @risg99 - Start of function definition to fetch all drugs for a disease using pagination
    async function fetchAllDrugsForDisease(efoId) {
      let allDrugs = [];
      let cursor = null;

      do {
        const query = `
          query getDrugsForBiomarkerDisease($efoId: String!, $cursor: String) {
            disease(efoId: $efoId) {
              knownDrugs(size: 1000, cursor: $cursor) {
                cursor
                rows {
                  drug {
                    id
                    name
                  }
                  target {
                    approvedSymbol
                    id
                  }
                  status
                  phase
                }
              }
            }
          }
        `;

        const response = await fetch("https://api.platform.opentargets.org/api/v4/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            variables: { efoId, cursor },
          }),
        });

        const result = await response.json();
        const drugsPage = result?.data?.disease?.knownDrugs;
        if (!drugsPage) break;

        allDrugs.push(...drugsPage.rows);
        cursor = drugsPage.cursor;

      } while (cursor);

      return allDrugs;
    }

    async function fetchDiseaseEfoId(diseaseName) {
      const query = `
        query Search($term: String!) {
          search(queryString: $term, entityNames: ["disease"]) {
            hits {
              id
              name
              entity
            }
          }
        }
      `;

      const variables = { term: diseaseName };

      const response = await fetch("https://api.platform.opentargets.org/api/v4/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      const efoRes = await response.json();
      const match = efoRes?.data?.search?.hits.find(
        (item) => item.entity === "disease"
      );

      if (!match || !match.id) {
        console.warn("⚠️ No matching EFO ID found for:", diseaseName);
        return null;
      }

      const efoId = match.id;
      return efoId;
    }
    // @risg99 - End of function definition to fetch all drugs for a disease using pagination

    // Progress indicator helper functions
    function showProgress(percentage, message) {
      const progressContainer = document.getElementById('progressContainer');
      const progressFill = document.getElementById('progressFill');
      const progressText = document.getElementById('progressText');

      progressContainer.classList.add('show');
      progressFill.style.width = percentage + '%';
      progressText.textContent = message;
    }

    function hideProgress() {
      const progressContainer = document.getElementById('progressContainer');
      progressContainer.classList.remove('show');
    }

    // Check if input looks like a question and extract disease name
    function isQuestion(text) {
      const questionWords = ['what', 'which', 'how', 'are', 'is', 'can', 'do', 'does'];
      const lowerText = text.toLowerCase();
      return questionWords.some(word => lowerText.startsWith(word));
    }

    // @risg99 - Start of Prefill functionality
    async function searchBiomarkers(prefilledDisease, customQuestion = null) {
      autocompleteList.style.display = 'none';
      let inputText = prefilledDisease || input.value.trim();
      if (!inputText) {
        output.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon"><i class="fas fa-search"></i></div>
            <h3 class="empty-title">Please enter a disease name</h3>
            <p class="empty-message">Try searching for conditions like "breast cancer", "multiple myeloma", or "NSCLC"</p>
          </div>
        `;
        return;
      }

      buttonText.style.display = "none";
      loadingSpinner.innerHTML = '<span class="loading-spinner"></span>';
      loadingSpinner.style.display = "inline";
      output.innerHTML = "";
      voiceSummaryContainer.style.display = "none"; // Hide previous voice summary
      relatedQuestions.style.display = "none"; // Hide previous related questions

      // Show initial progress
      showProgress(20, 'Looking up disease...');

      let diseaseName = inputText;

      // If input is a question, extract disease name via voice API first
      if (isQuestion(inputText) && !customQuestion) {
        customQuestion = inputText;
        try {
          const response = await fetch("https://us-central1-biomarker-matchmaker.cloudfunctions.net/askBiomarkerVoice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: customQuestion,
              voiceId: selectedVoiceId
            })
          });
          const data = await response.json();
          if (data.disease) {
            diseaseName = data.disease;
            console.log('Extracted disease name:', diseaseName);
          }
        } catch (error) {
          console.error("Error extracting disease name:", error);
        }
      }

      // Start fetching voice summary in parallel (don't await yet)
      const voiceSummaryPromise = fetchVoiceSummary(diseaseName, customQuestion);

      try {
        // @risg99 - Start of call to fetchDiseaseEfoId
        const efoId = await fetchDiseaseEfoId(diseaseName);

        if (!efoId) {
          output.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon"><i class="fas fa-exclamation-circle"></i></div>
              <h3 class="empty-title">Disease not found</h3>
              <p class="empty-message">Please check your spelling or try a different disease name.</p>
            </div>
          `;
          buttonText.style.display = "inline";
          loadingSpinner.style.display = "none";
          hideProgress();
          return;
        }
        // @risg99 - End of call to fetchDiseaseEfoId

        // Update progress
        showProgress(40, 'Fetching biomarkers from Open Targets...');

        // Fetch biomarkers from API
        const response = await fetch("https://us-central1-biomarker-matchmaker.cloudfunctions.net/getBiomarkers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disease: diseaseName })
        });
        const data = await response.json();

        if (data.error) {
          output.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon"><i class="fas fa-exclamation-circle"></i></div>
              <h3 class="empty-title">Error</h3>
              <p class="empty-message">${data.error}</p>
            </div>
          `;
          buttonText.style.display = "inline";
          loadingSpinner.style.display = "none";
          hideProgress();
          return;
        }

        // Update progress
        showProgress(60, 'Analyzing biomarker data...');

        // @risg99 - Start of function definition & calls to match drugs to biomarkers
        function matchDrugsToBiomarkers(drugs, biomarkers) {
          const matched = [];

          drugs.forEach((row, i) => {
            const { drug, target, status, phase } = row;
            if (!drug || !target) return;

            const matchIndex = biomarkers.findIndex(b =>
              b.geneName?.toLowerCase() === target.approvedSymbol?.toLowerCase() ||
              (b.openTargetsLink && b.openTargetsLink.includes(target.id))
            );

            if (matchIndex === -1) return;

            matched.push({
              drug,
              target,
              matchedBiomarkerIndex: matchIndex,
              status,
              phase
            });
          });

          return matched;
        }

        const allDrugs = await fetchAllDrugsForDisease(efoId);

        // Remove duplicate drug-target pairs
        const uniqueDrugs = [];
        const seen = new Set();

        for (let row of allDrugs) {
          const key = `${row.drug.id}_${row.target.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueDrugs.push(row);
          }
        }
        const matchedDrugs = matchDrugsToBiomarkers(uniqueDrugs, data.biomarkers);
        console.log("💊 Matched drugs:", matchedDrugs);
        // @risg99 - End of function definition & calls to match drugs to biomarkers

        // Update progress
        showProgress(80, 'Generating AI explanations...');

        // Create card for each biomarker
        const biomarkerList = data.biomarkers.map(b => `
          <div class="biomarker-card fade-in">
            <div class="card-blob"></div>
            <div class="biomarker-type">
              Classifying...
            </div>
            <h3 class="biomarker-name">${b.name}</h3>
            <div class="biomarker-gene">${b.geneName}</div>
            <div class="biomarker-score">
              <span class="score-label">Score
                <span class="tooltip-icon">?
                  <span class="tooltip">This score (0–1) reflects how strongly the biomarker is associated with the disease, based on evidence from Open Targets. A higher score means a stronger association.</span>
                </span>
              </span>
              <div class="score-bar-container">
                <div class="score-bar" style="width: ${Math.round(b.score * 100)}%"></div>
              </div>
              <span class="score-value">${parseFloat(b.score).toFixed(2)}</span>
            </div>
            <p class="biomarker-summary">${b.summary}</p>
            <a href="${b.openTargetsLink}" target="_blank" rel="noopener noreferrer" class="biomarker-link">
              Learn More on Open Targets
              <i class="fas fa-external-link-alt"></i>
            </a>
          </div>
        `).join("");

        // @risg99 - Start of Export buttons added
        let resultsHTML = `
          <button id="showFullAnalysisBtn" class="show-full-analysis-btn">
            <i class="fas fa-chevron-down"></i>
            <span>Show Full Analysis</span>
            <span class="full-analysis-subtitle">View detailed biomarker cards, scores, and network visualization</span>
          </button>
          <div id="fullAnalysisSection" class="full-analysis-section" style="display: none;">
            <div class="result-header fade-in">
              <h2 class="result-title">Top biomarkers for ${data.disease}</h2>
            </div>
            <div class="export-buttons">
              <button id="exportCSV" class="export-btn"><i class="fas fa-file-csv"></i> Export to CSV</button>
              <button id="exportPDF" class="export-btn"><i class="fas fa-file-pdf"></i> Download PDF Summary</button>
            </div>
            <div class="biomarker-grid">
              ${biomarkerList}
            </div>

            <!-- Toggle button and graph visualization -->
            <div style="margin-top: 20px;">
              <button id="toggleViewBtn" style="
                  background: var(--accent);
                  color: white;
                  border: none;
                  border-radius: var(--border-radius);
                  padding: 12px 18px;
                  font-size: 14px;
                  font-weight: bold;
                  cursor: pointer;
                  margin-bottom: 15px;
                ">
                Toggle to Visual Mode
              </button>
            </div>

            <div class="graph-controls" style="display: none" id="visualControls">
              <div id="graphLegend" class="graph-legend">
                <span class="legend-item">
                  <span class="legend-color disease"></span> Disease
                </span>
                <span class="legend-item">
                  <span class="legend-color predictive"></span> Biomarker - Predictive
                </span>
                <span class="legend-item">
                  <span class="legend-color prognostic"></span> Biomarker - Prognostic
                </span>
                <span class="legend-item">
                  <span class="legend-color diagnostic"></span> Biomarker - Diagnostic
                </span>
                <span class="legend-item">
                  <span class="legend-color drug"></span> Drug
                </span>
              </div>
            </div>

            <div id="cy" style="display: none; width: 100%; height: 600px; border-radius: var(--border-radius); box-shadow: var(--card-shadow); background-color: white; margin-top: 20px;">
            </div>

          </div>
        `;
        // @risg99 - End of Export buttons added

        // Final progress update
        showProgress(100, 'Complete!');

        output.innerHTML = resultsHTML;

        // Show Full Analysis button handler
        const showFullAnalysisBtn = document.getElementById("showFullAnalysisBtn");
        const fullAnalysisSection = document.getElementById("fullAnalysisSection");

        if (showFullAnalysisBtn && fullAnalysisSection) {
          showFullAnalysisBtn.addEventListener("click", () => {
            const isExpanded = fullAnalysisSection.style.display !== "none";

            if (isExpanded) {
              // Collapse
              fullAnalysisSection.style.display = "none";
              showFullAnalysisBtn.classList.remove("expanded");
              showFullAnalysisBtn.querySelector("span:first-of-type").textContent = "Show Full Analysis";
            } else {
              // Expand
              fullAnalysisSection.style.display = "block";
              showFullAnalysisBtn.classList.add("expanded");
              showFullAnalysisBtn.querySelector("span:first-of-type").textContent = "Hide Full Analysis";
            }
          });
        }

        const typeSpans = document.querySelectorAll(".biomarker-type");

        // Use classification data already returned from backend (no additional API calls needed)
        const classifications = data.biomarkers.map((biomarker, i) => {
          const type = biomarker.type || biomarker.category || "unknown";
          const typeText = type.toLowerCase();

          let typeClass = "";
          if (typeText.includes("predictive")) {
            typeClass = "predictive";
          } else if (typeText.includes("prognostic")) {
            typeClass = "prognostic";
          } else if (typeText.includes("diagnostic")) {
            typeClass = "diagnostic";
          }

          // Update UI with classification
          const formattedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
          typeSpans[i].textContent = formattedType;
          if (typeClass) typeSpans[i].classList.add(typeClass);

          return typeClass || "unknown";
        });

        // Build graph with biomarkers, disease, and drugs
        buildGraph(data, classifications, matchedDrugs);

        // @risg99 - Start of Export to CSV and PDF functionality
        setTimeout(() => {
          document.getElementById("exportCSV").addEventListener("click", () => {
            const cards = document.querySelectorAll(".biomarker-card");
            const csvRows = [];

            const date = new Date().toISOString().split("T")[0];
            csvRows.push(`BiomarkerFinder Summary Report`);
            csvRows.push(`Disease: ${data.disease}`);
            csvRows.push(`Date: ${date}`);
            csvRows.push(`Evidence Source: Open Targets`);
            csvRows.push("");

            const headers = ["#", "Biomarker", "Gene", "Score", "Type", "Summary", "Evidence Source"];
            csvRows.push(headers.join(","));

            function quoteCSV(value) {
              if (value === null || value === undefined) return "";
              const safeValue = value.replace(/"/g, '""');
              return `"${safeValue}"`;
            }

            cards.forEach((card, i) => {
              const name = card.querySelector(".biomarker-name").textContent.trim();
              const gene = card.querySelector(".biomarker-gene").textContent.trim();
              const score = card.querySelector(".score-value").textContent.trim();
              const type = card.querySelector(".biomarker-type").textContent.trim();
              const summary = card.querySelector(".biomarker-summary").textContent.trim();
              const link = card.querySelector(".biomarker-link").href.trim();

              const row = [
                i + 1,
                quoteCSV(name),
                quoteCSV(gene),
                quoteCSV(score),
                quoteCSV(type),
                quoteCSV(summary),
                quoteCSV(link)
              ].join(",");
              csvRows.push(row);
            });

            const csvContent = "\uFEFF" + csvRows.join("\n");

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${data.disease.replace(/\s+/g, "_")}_biomarkers_${date}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          });

          document.getElementById("exportPDF").addEventListener("click", async () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

            const date = new Date().toLocaleDateString();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const marginX = 14;
            let y = 30;
            const lineHeight = 7;

            doc.setFillColor(220, 230, 255);
            doc.rect(0, 0, pageWidth, 20, "F");
            doc.setTextColor(30, 30, 100);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(18);
            doc.text("BiomarkerFinder Summary Report", marginX, 13);

            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            doc.text(`Disease: ${data.disease}`, marginX, y);
            doc.text(`Date: ${date}`, marginX, y + 6);
            doc.text("Evidence Source: Open Targets", marginX, y + 12);
            y += 22;

            doc.setDrawColor(180);
            doc.line(marginX, y, pageWidth - marginX, y);
            y += 8;

            const cards = document.querySelectorAll(".biomarker-card");
            let pageNumber = 1;

            function checkPageSpace(extraSpace = 0) {
              if (y + extraSpace > pageHeight - 20) {
                doc.setFontSize(10);
                doc.setTextColor(150);
                doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: "center" });
                doc.addPage();
                pageNumber++;
                y = 20;
                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                doc.setTextColor(30, 30, 100);
                doc.text("BiomarkerFinder Summary (continued)", marginX, y);
                y += 10;
                doc.setDrawColor(200);
                doc.line(marginX, y, pageWidth - marginX, y);
                y += 8;
                doc.setFont("helvetica", "normal");
                doc.setTextColor(0, 0, 0);
              }
            }

            cards.forEach((card, index) => {
              const name = card.querySelector(".biomarker-name").textContent;
              const gene = card.querySelector(".biomarker-gene").textContent || "N/A";
              const score = card.querySelector(".score-value").textContent || "N/A";
              const type = card.querySelector(".biomarker-type").textContent || "Unclassified";
              const summary = card.querySelector(".biomarker-summary").textContent || "";
              const link = card.querySelector(".biomarker-link").href;

              checkPageSpace(40);

              doc.setFont("helvetica", "bold");
              doc.setFontSize(14);
              doc.setTextColor(30, 30, 100);
              doc.text(`${index + 1}. ${name}`, marginX, y);
              y += lineHeight;

              doc.setFont("helvetica", "normal");
              doc.setFontSize(12);
              doc.setTextColor(0, 0, 0);
              doc.text(`• Gene: ${gene}`, marginX + 4, y);
              y += lineHeight;
              doc.text(`• Score: ${score}`, marginX + 4, y);
              y += lineHeight;
              doc.text(`• Type: ${type}`, marginX + 4, y);
              y += lineHeight;

              const summaryLines = doc.splitTextToSize(`• Summary: ${summary}`, pageWidth - marginX * 2);
              checkPageSpace(summaryLines.length * 6);
              doc.text(summaryLines, marginX + 4, y);
              y += summaryLines.length * 6;

              doc.setTextColor(0, 0, 180);
              const urlLines = doc.splitTextToSize(`• Evidence Source: ${link}`, pageWidth - marginX * 2);
              doc.text(urlLines, marginX + 4, y);
              doc.setTextColor(0, 0, 0);
              y += urlLines.length * 6 + 6;

              doc.setDrawColor(230);
              doc.line(marginX, y, pageWidth - marginX, y);
              y += 6;
            });

            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: "center" });

            doc.save(`${data.disease.replace(/\s+/g, "_")}_biomarkers_summary.pdf`);
          });
        }, 700);
        // @risg99 - End of Export to CSV and PDF functionality

      } catch (err) {
        console.error(err);
        output.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon"><i class="fas fa-exclamation-circle"></i></div>
            <h3 class="empty-title">Something went wrong</h3>
            <p class="empty-message">Please try again later.</p>
          </div>
        `;
      } finally {
        buttonText.style.display = "inline";
        loadingSpinner.style.display = "none";

        // Hide progress after a brief delay to show "Complete!" message
        setTimeout(() => hideProgress(), 800);
      }
    }

    // @risg99 - Start of building graph function definition
    function buildGraph(data, classifications = [], drugRows = []) {
      const toggleBtn = document.getElementById("toggleViewBtn");
      const cyContainer = document.getElementById("cy");
      const visualControls = document.getElementById("visualControls");

      if (toggleBtn) {
        toggleBtn.style.display = "inline-block";

        // Add toggle button event listener
        toggleBtn.addEventListener("click", () => {
          const resultHeader = document.querySelector(".result-header");
          const exportButtons = document.querySelector(".export-buttons");
          const biomarkerGrid = document.querySelector(".biomarker-grid");

          const isVisual = cyContainer.style.display === "block";
          if (isVisual) {
            // Switch to List Mode
            cyContainer.style.display = "none";
            if (resultHeader) resultHeader.style.display = "block";
            if (exportButtons) exportButtons.style.display = "flex";
            if (biomarkerGrid) biomarkerGrid.style.display = "grid";
            toggleBtn.textContent = "Toggle to Visual Mode";
            visualControls.style.display = "none";
          } else {
            // Switch to Visual Mode
            cyContainer.style.display = "block";
            if (resultHeader) resultHeader.style.display = "none";
            if (exportButtons) exportButtons.style.display = "none";
            if (biomarkerGrid) biomarkerGrid.style.display = "none";
            toggleBtn.textContent = "Toggle to List Mode";
            visualControls.style.display = "flex";
          }
        });
      }

      const nodes = [];
      const edges = [];

      nodes.push({ data: { id: "disease", label: data.disease, type: "disease", tooltip: data.disease } });

      data.biomarkers.forEach((b, idx) => {
        const biId = `b_${idx}`;
        nodes.push({
          data: {
            id: biId,
            label: b.name,
            type: (classifications[idx] || "unknown").toLowerCase(),
            tooltip: b.summary
          }
        });
        edges.push({ data: { source: biId, target: "disease" } });
      });

      drugRows.forEach((row, i) => {
        const drug = row.drug;
        const target = row.target;
        if (!drug || !target) return;

        const biomIdx = data.biomarkers.findIndex(
          b => b.openTargetsLink.includes(target.id) || b.geneName.toLowerCase() === target.approvedSymbol.toLowerCase()
        );

        const biId = `b_${biomIdx}`;
        const drugId = `drug_${drug.id}_${i}`;

        if (!nodes.some(n => n.data.id === drugId)) {
          nodes.push({
            data: {
              id: drugId,
              label: drug.name,
              type: "drug",
              tooltip: `Status: ${row.status}, Phase: ${row.phase}`
            }
          });
        }

        edges.push({ data: { source: biId, target: drugId } });
      });

      const cy = cytoscape({
        container: cyContainer,
        elements: [...nodes.map(n => ({ data: n.data })), ...edges],

        layout: {
          name: "cose",
          animate: true,
          animationDuration: 1000,
          fit: true,
          padding: 80,
          nodeRepulsion: 4000000,
          idealEdgeLength: 500,
          gravity: 100,
          numIter: 1000,
          initialTemp: 200,
          coolingFactor: 0.95,
          minTemp: 1.0
        },

        style: [
          {
            selector: "node",
            style: {
              label: "data(label)",
              "background-color": ele => {
                const t = ele.data("type");
                switch (t) {
                  case "predictive": return "#06d6a0";
                  case "prognostic": return "#ffd166";
                  case "diagnostic": return "#ef476f";
                  case "disease": return "#4361ee";
                  case "drug": return "#ff69b4";
                  default: return "#adb5bd";
                }
              },
              width: ele => {
                const t = ele.data("type");
                return t === "disease" ? 160 : t === "drug" ? 80 : 70;
              },
              height: ele => {
                const t = ele.data("type");
                return t === "disease" ? 160 : t === "drug" ? 80 : 70;
              },
              "font-size": ele => {
                const t = ele.data("type");
                return t === "disease" ? "24px" : "14px";
              },
              color: "#2b2d42",
              "text-valign": "center",
              "text-halign": "center",
              shape: "ellipse",
              "text-wrap": "wrap",
              "text-max-width": "100px",
              "overlay-padding": "6px",
              "z-index": 10
            }
          },
          {
            selector: "edge",
            style: {
              width: 3,
              "line-color": "#bcbcbc",
              "curve-style": "unbundled-bezier",
              "target-arrow-shape": "triangle",
              "target-arrow-color": "#bcbcbc",
              "arrow-scale": 1.5,
              "opacity": 0.7
            }
          },
          {
            selector: ":selected",
            style: {
              "background-color": "#ffb703",
              "line-color": "#fb8500",
              "target-arrow-color": "#fb8500",
              "source-arrow-color": "#fb8500",
              "border-width": 2,
              "border-color": "#ffb703"
            }
          }
        ]
      });

      cy.nodes().forEach(node => {
        node.on('mouseover', () => {
          const tooltip = document.createElement('div');
          tooltip.className = 'cy-tooltip';
          tooltip.textContent = node.data('tooltip');
          document.body.appendChild(tooltip);
          tooltip.style.position = 'absolute';
          tooltip.style.left = `${event.pageX + 10}px`;
          tooltip.style.top = `${event.pageY + 10}px`;
        });

        node.on('mouseout', () => {
          const existing = document.querySelector('.cy-tooltip');
          if (existing) existing.remove();
        });
      });

      cy.ready(() => {
        cy.layout({ name: 'cose', animate: true }).run();
        setTimeout(() => {
          cy.fit();
        }, 500);
      });
    }
    // @risg99 - End of building graph function definition

    window.addEventListener('load', () => {
      input.value = "";
      fetchDiseases();
    });
