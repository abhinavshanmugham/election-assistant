import React, { useState, useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { getResponse } from "./utils/nlp.js";
import "./App.css";

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const chatBoxRef = useRef(null);

  // Web-only speech recognition instance
  const recognitionRef = useRef(null);

  // Setup speech capabilities
  useEffect(() => {
    const platform = Capacitor.getPlatform();

    if (platform === "web") {
      // Browser (laptop/desktop) – use Web Speech API
      if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
        const SpeechRecognitionCtor =
          window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = "en-IN";
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);

        recognition.onresult = (event) => {
          const speechText = event.results[0][0].transcript;
          handleSend(speechText);
        };

        recognitionRef.current = recognition;
      } else {
        // eslint-disable-next-line no-console
        console.warn("Speech recognition not supported in this browser.");
      }
    } else {
      // Native (Android APK) – prepare native speech recognition
      (async () => {
        try {
          const available = await SpeechRecognition.available();
          if (!available.available) {
            // eslint-disable-next-line no-console
            console.warn("Native speech recognition not available on this device.");
            return;
          }

          const perm = await SpeechRecognition.hasPermission();
          if (!perm.permission) {
            await SpeechRecognition.requestPermissions();
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("Error initializing native speech recognition", e);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setup once; handleSend stable for callback
  }, []);

  const appendMessages = (userText, botPayload) => {
    const userMsg = { text: userText, sender: "user" };
    const botMsg = { ...botPayload, sender: "bot" };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    speakText(botPayload.text);
  };

  const speakText = async (text) => {
    if (!text) return;

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const englishParts = [];
    const tamilParts = [];

    lines.forEach((line) => {
      const hasTamil = /[\u0B80-\u0BFF]/.test(line);
      if (hasTamil) {
        tamilParts.push(line);
      } else {
        englishParts.push(line);
      }
    });

    const queue = [];
    if (englishParts.length) {
      queue.push({ lang: "en-IN", text: englishParts.join(". "), pitch: 0.9 });
    }
    if (tamilParts.length) {
      queue.push({ lang: "ta-IN", text: tamilParts.join(" "), pitch: 1.0 });
    }
    if (!queue.length) {
      queue.push({ lang: "en-IN", text, pitch: 1.0 });
    }

    const platform = Capacitor.getPlatform();

    // Prefer native TTS on device (APK)
    if (platform !== "web") {
      try {
        await TextToSpeech.stop();
        // Speak English then Tamil parts on device, using appropriate language codes.
        // Pitch 0.9 is slightly deeper (more \"male-like\") for English where supported.
        // Order matches the combined queue built above.
        // eslint-disable-next-line no-restricted-syntax
        for (const part of queue) {
          // eslint-disable-next-line no-await-in-loop
          await TextToSpeech.speak({
            text: part.text,
            lang: part.lang,
            rate: 1.0,
            pitch: part.pitch
          });
        }
        return;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Native TTS failed, falling back to browser TTS if available", e);
      }
    }

    // Browser fallback (laptop)
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    synth.cancel();

    let index = 0;
    const speakNext = () => {
      if (index >= queue.length) return;
      const { lang, text: partText } = queue[index++];
      const utterance = new SpeechSynthesisUtterance(partText);
      utterance.lang = lang;
      utterance.onend = () => {
        if (index < queue.length) {
          setTimeout(speakNext, 500);
        }
      };
      synth.speak(utterance);
    };

    speakNext();
  };

  const callBackend = async (messageText) => {
    try {
      setIsLoading(true);
      const apiBase =
        process.env.REACT_APP_API_URL ||
        (process.env.NODE_ENV === "development"
          ? "http://localhost:5000"
          : "https://election-assistant.onrender.com");
      const res = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: messageText })
      });

      if (!res.ok) {
        throw new Error("Backend error");
      }

      const data = await res.json();
      return { text: data.text, image: data.image };
    } catch (e) {
      return getResponse(messageText);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (msg = null) => {
    const messageText = (msg || input).trim();
    if (!messageText) return;
    setInput("");

    const botPayload = await callBackend(messageText);
    appendMessages(messageText, botPayload);
  };

  const startListening = async () => {
    const platform = Capacitor.getPlatform();

    if (platform === "web") {
      // Browser – use Web Speech API
      if (recognitionRef.current) {
        recognitionRef.current.start();
      } else {
        // Optional: user feedback
        // eslint-disable-next-line no-alert
        alert("Voice input is not supported in this browser.");
      }
      return;
    }

    // Native (APK) – use Capacitor SpeechRecognition
    try {
      const available = await SpeechRecognition.available();
      if (!available.available) {
        // eslint-disable-next-line no-alert
        alert("Voice input is not available on this device.");
        return;
      }

      const perm = await SpeechRecognition.hasPermission();
      if (!perm.permission) {
        await SpeechRecognition.requestPermissions();
        const permAfter = await SpeechRecognition.hasPermission();
        if (!permAfter.permission) {
          // eslint-disable-next-line no-alert
          alert("Microphone permission was not granted. Please enable it in app settings.");
          return;
        }
      }

      setIsListening(true);
      const result = await SpeechRecognition.start({
        language: "en-IN",
        maxResults: 1,
        partialResults: false,
        popup: true,
        prompt: "Please speak your election question"
      });
      setIsListening(false);

      const speechText =
        result && Array.isArray(result.matches) && result.matches.length
          ? result.matches[0]
          : "";
      if (speechText) {
        handleSend(speechText);
      } else {
        // eslint-disable-next-line no-alert
        alert("I could not hear anything. Please try speaking again.");
      }
    } catch (e) {
      setIsListening(false);
      // eslint-disable-next-line no-console
      console.error("Speech recognition error", e);
      // eslint-disable-next-line no-alert
      alert("There was an error starting voice input on this device.");
    }
  };

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTo(0, chatBoxRef.current.scrollHeight);
    }
  }, [messages]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-icon">🗳️</span>
          <div>
            <h1>Election Assistant</h1>
            <p>Ask about parties, flags, symbols, and leaders.</p>
          </div>
        </div>
      </header>

      <main className="chat-container">
        <div className="chat-box" ref={chatBoxRef}>
          {messages.length === 0 && (
            <div className="chat-placeholder">
              <p>
                Try asking: <strong>“Show DMK flag”</strong> or{" "}
                <strong>“Who is CM of Tamil Nadu?”</strong>
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.sender}`}>
              {msg.sender === "bot" && (
                <div className="message-avatar" aria-hidden="true">
                  🤖
                </div>
              )}
              <div className="message-content">
                {msg.text && <p>{msg.text}</p>}
                {msg.image && (
                  <div className="message-image-wrapper">
                    <img src={msg.image} alt="" />
                  </div>
                )}
              </div>
              {msg.sender === "user" && (
                <div className="message-avatar" aria-hidden="true">
                  👤
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="message bot typing">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          )}
        </div>
      </main>

      <footer className="input-area">
        <div className="input-box">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSend();
              }
            }}
            placeholder="Type your election question..."
          />
          <button
            type="button"
            className="primary-button"
            onClick={() => handleSend()}
          >
            Send
          </button>
          <button
            type="button"
            className={`icon-button ${isListening ? "listening" : ""}`}
            onClick={startListening}
            title="Speak your question"
          >
            🎤
          </button>
        </div>
        <p className="input-hint">
          Voice input uses your device microphone. On mobile, please allow microphone
          permission when asked.
        </p>
      </footer>
    </div>
  );
}

export default App;