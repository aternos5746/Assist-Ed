import { useState } from "react";
import { BookOpen, Layers, MessageSquare, Loader2, PenLine, ImagePlus, X } from "lucide-react";

// images: array of { data: base64, media_type: "image/png" | "image/jpeg" | ... }
async function askClaude(system, userText, images = []) {
  const content = images.length
    ? [
        ...images.map((img) => ({
          type: "image",
          source: { type: "base64", media_type: img.media_type, data: img.data },
        })),
        { type: "text", text: userText },
      ]
    : userText;

  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, content }),
  });
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("empty response");
  return text;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

const TABS = [
  { id: "lesson", label: "Lesson scaffold", icon: BookOpen },
  { id: "questions", label: "Question variants", icon: Layers },
  { id: "feedback", label: "Feedback draft", icon: MessageSquare },
];

function Field({ label, children }) {
  return (
    <label className="pp-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function DraftPaper({ text, onChange, reviewed, onReviewed, placeholder }) {
  return (
    <div className="pp-paper">
      <div className="pp-paper-head">
        <span className="pp-margin-note">still a draft — edit anything</span>
      </div>
      <textarea
        className="pp-paper-text"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      <label className="pp-signoff">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => onReviewed(e.target.checked)}
        />
        <span>I've read this through and it's ready to use</span>
      </label>
    </div>
  );
}

export default function PrepPeriod() {
  const [tab, setTab] = useState("lesson");

  // Lesson scaffold state
  const [lesson, setLesson] = useState({ subject: "", topic: "", level: "", duration: "50 min" });
  const [lessonOut, setLessonOut] = useState("");
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonReviewed, setLessonReviewed] = useState(false);
  const [lessonError, setLessonError] = useState("");

  // Question variants state
  const [q, setQ] = useState({ topic: "", concept: "" });
  const [qOut, setQOut] = useState(null); // {easy, medium, hard, stretch}
  const [qLoading, setQLoading] = useState(false);
  const [qError, setQError] = useState("");

  // Feedback draft state
  const [fb, setFb] = useState({ context: "", work: "", focus: "" });
  const [fbImages, setFbImages] = useState([]); // { data, media_type, previewUrl, name }
  const [fbOut, setFbOut] = useState("");
  const [fbLoading, setFbLoading] = useState(false);
  const [fbReviewed, setFbReviewed] = useState(false);
  const [fbError, setFbError] = useState("");

  async function handleFbImageUpload(e) {
    const files = Array.from(e.target.files || []);
    setFbError("");
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      if (fbImages.length + 1 > 4) {
        setFbError("Up to 4 photos at a time.");
        break;
      }
      try {
        const data = await fileToBase64(file);
        setFbImages((prev) => [
          ...prev,
          { data, media_type: file.type, previewUrl: URL.createObjectURL(file), name: file.name },
        ]);
      } catch {
        setFbError("Couldn't read that photo. Try another.");
      }
    }
    e.target.value = "";
  }

  function removeFbImage(idx) {
    setFbImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function generateLesson() {
    if (!lesson.topic.trim()) return;
    setLessonLoading(true);
    setLessonError("");
    setLessonReviewed(false);
    try {
      const system =
        "You help a teacher draft a lesson scaffold. Output plain text only, no markdown symbols like ** or #. Use exactly these section headers, each on its own line in capitals: OBJECTIVE, STARTER, MAIN ACTIVITY, PLENARY, MATERIALS, DIFFERENTIATION NOTE. Keep each section short and concrete to the specific topic given, never generic filler. This is a draft the teacher will edit before teaching from it.";
      const userText = `Subject: ${lesson.subject || "not specified"}\nTopic: ${lesson.topic}\nStudent level: ${lesson.level || "not specified"}\nLesson length: ${lesson.duration}`;
      const text = await askClaude(system, userText);
      setLessonOut(text);
    } catch (e) {
      setLessonError("Couldn't reach the draft. Try again.");
    } finally {
      setLessonLoading(false);
    }
  }

  async function generateQuestions() {
    if (!q.concept.trim()) return;
    setQLoading(true);
    setQError("");
    try {
      const system =
        'Output ONLY valid JSON, no markdown fences, no preamble, no trailing text. Schema: {"easy": string, "medium": string, "hard": string, "stretch": string}. Each value is one question testing the same underlying concept, increasing in difficulty. Questions should read like real exam or classwork questions, specific to the concept given, not vague.';
      const userText = `Topic: ${q.topic || "not specified"}\nConcept to test: ${q.concept}`;
      const raw = await askClaude(system, userText);
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setQOut(parsed);
    } catch (e) {
      setQError("Couldn't reach the draft. Try again.");
    } finally {
      setQLoading(false);
    }
  }

  async function generateFeedback() {
    const hasText = fb.work.trim().length > 0;
    const hasImages = fbImages.length > 0;
    if (!hasText && !hasImages) return;
    setFbLoading(true);
    setFbError("");
    setFbReviewed(false);
    try {
      const system =
        "You help a teacher draft feedback on one piece of student work, which may be typed text, one or more photos of handwritten or hand-drawn work, or both. Read the work carefully, including anything in the photos, before writing. Never output a grade, mark, score, or percentage — that judgement stays with the teacher. Write 3 to 5 sentences, addressed to the student directly: one specific strength tied to the actual work, one specific area to improve tied to the actual work, one concrete next step. If handwriting in a photo is unclear, say so plainly rather than guessing. Plain text, no headers, no markdown.";
      const userText = `Assignment context: ${fb.context || "not specified"}\nWhat to focus feedback on: ${fb.focus || "teacher's general judgement"}\n${
        hasImages ? `\n${fbImages.length} photo(s) of the student's work are attached.` : ""
      }${hasText ? `\n\nStudent's work (typed):\n${fb.work}` : ""}`;
      const text = await askClaude(system, userText, fbImages);
      setFbOut(text);
    } catch (e) {
      setFbError("Couldn't reach the draft. Try again.");
    } finally {
      setFbLoading(false);
    }
  }

  return (
    <div className="pp-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400;500;600&family=Kalam:wght@400;700&display=swap');

        .pp-root {
          --ink: #221d14;
          --paper: #efe6cd;
          --paper-dark: #e4d8b8;
          --board: #1f2e28;
          --board-light: #2c4038;
          --chalk: #f4f1e8;
          --red: #b23b2e;
          --red-dark: #8f2f24;
          --muted: #8a7c5e;
          font-family: 'Inter', sans-serif;
          background: var(--board);
          color: var(--chalk);
          min-height: 100%;
          padding: 32px 20px 60px;
          box-sizing: border-box;
        }
        .pp-root * { box-sizing: border-box; }

        .pp-hero { max-width: 780px; margin: 0 auto 36px; }
        .pp-eyebrow {
          font-family: 'Kalam', cursive;
          color: var(--red);
          font-size: 15px;
          transform: rotate(-1deg);
          display: inline-block;
          margin-bottom: 6px;
        }
        .pp-title {
          font-family: 'Fraunces', serif;
          font-size: 42px;
          font-weight: 600;
          margin: 0 0 10px;
          letter-spacing: -0.01em;
        }
        .pp-sub {
          color: #cfd3c9;
          font-size: 15.5px;
          line-height: 1.55;
          max-width: 560px;
          margin: 0;
        }

        .pp-tabs {
          max-width: 780px;
          margin: 0 auto;
          display: flex;
          gap: 6px;
        }
        .pp-tab {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14px;
          color: var(--muted);
          background: var(--board-light);
          border: none;
          padding: 12px 18px 10px;
          border-radius: 10px 10px 0 0;
          display: flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          opacity: 0.75;
          transition: transform 0.15s ease, opacity 0.15s ease;
        }
        .pp-tab:hover { opacity: 1; }
        .pp-tab.active {
          background: var(--paper);
          color: var(--ink);
          opacity: 1;
          transform: translateY(2px);
        }

        .pp-panel {
          max-width: 780px;
          margin: 0 auto;
          background: var(--paper);
          border-radius: 0 12px 12px 12px;
          padding: 28px 28px 30px;
          color: var(--ink);
        }
        .pp-panel h2 {
          font-family: 'Fraunces', serif;
          font-size: 21px;
          font-weight: 600;
          margin: 0 0 4px;
        }
        .pp-panel p.pp-hint {
          margin: 0 0 20px;
          color: var(--muted);
          font-size: 13.5px;
        }

        .pp-form { display: flex; flex-direction: column; gap: 14px; }
        .pp-row { display: flex; gap: 12px; }
        .pp-row .pp-field { flex: 1; }

        .pp-field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; font-weight: 600; color: #5a5136; }
        .pp-field input, .pp-field textarea {
          font-family: 'Inter', sans-serif;
          font-size: 14.5px;
          font-weight: 400;
          color: var(--ink);
          background: var(--paper-dark);
          border: 1.5px solid #d9cba0;
          border-radius: 8px;
          padding: 10px 12px;
          outline: none;
          resize: vertical;
        }
        .pp-field input:focus, .pp-field textarea:focus, .pp-paper-text:focus {
          border-color: var(--red);
        }

        .pp-btn {
          align-self: flex-start;
          margin-top: 4px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14.5px;
          background: var(--red);
          color: var(--chalk);
          border: none;
          border-radius: 8px;
          padding: 11px 20px;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .pp-btn:hover { background: var(--red-dark); }
        .pp-btn:disabled { opacity: 0.55; cursor: default; }

        .pp-error { color: var(--red-dark); font-size: 13.5px; font-weight: 600; margin-top: 4px; }

        .pp-upload-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .pp-thumb {
          position: relative;
          width: 64px;
          height: 64px;
          border-radius: 8px;
          overflow: hidden;
          border: 1.5px solid #d9cba0;
          flex-shrink: 0;
        }
        .pp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .pp-thumb-remove {
          position: absolute;
          top: 2px;
          right: 2px;
          background: rgba(34, 29, 20, 0.75);
          border: none;
          color: var(--chalk);
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
        }
        .pp-upload-btn {
          width: 64px;
          height: 64px;
          flex-shrink: 0;
          border: 1.5px dashed #c9b787;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          cursor: pointer;
          color: var(--muted);
          font-size: 9.5px;
          font-weight: 600;
          text-align: center;
          transition: border-color 0.15s ease, color 0.15s ease;
        }
        .pp-upload-btn:hover { border-color: var(--red); color: var(--red); }

        .pp-paper {
          margin-top: 20px;
          background: #fbf7ea;
          border-left: 3px solid var(--red);
          border-radius: 4px;
          padding: 16px 18px 14px;
          box-shadow: 0 1px 0 rgba(0,0,0,0.04);
        }
        .pp-paper-head { display: flex; justify-content: flex-end; margin-bottom: 4px; }
        .pp-margin-note {
          font-family: 'Kalam', cursive;
          color: var(--red);
          font-size: 13px;
          transform: rotate(-1.5deg);
          display: inline-block;
        }
        .pp-paper-text {
          width: 100%;
          min-height: 220px;
          border: none;
          background: transparent;
          font-family: 'Inter', sans-serif;
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--ink);
          resize: vertical;
          padding: 0;
        }
        .pp-signoff {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
          font-size: 13px;
          color: #5a5136;
        }
        .pp-signoff input { accent-color: var(--red); width: 15px; height: 15px; }

        .pp-qgrid {
          margin-top: 20px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .pp-qcard {
          background: #fbf7ea;
          border-radius: 8px;
          padding: 14px 16px;
          border-left: 3px solid var(--red);
        }
        .pp-qcard-label {
          font-family: 'Kalam', cursive;
          font-size: 13.5px;
          color: var(--red);
          margin-bottom: 6px;
          display: block;
        }
        .pp-qcard textarea {
          width: 100%;
          border: none;
          background: transparent;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink);
          resize: vertical;
          min-height: 70px;
          padding: 0;
        }

        .pp-foot {
          max-width: 780px;
          margin: 30px auto 0;
          font-size: 13px;
          color: #9aa39a;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pp-spin { animation: pp-spin 0.9s linear infinite; }
        @keyframes pp-spin { to { transform: rotate(360deg); } }

        @media (max-width: 600px) {
          .pp-row { flex-direction: column; }
          .pp-qgrid { grid-template-columns: 1fr; }
          .pp-title { font-size: 32px; }
        }
      `}</style>

      <div className="pp-hero">
        <span className="pp-eyebrow">for the ten minutes between classes</span>
        <h1 className="pp-title">Prep Period</h1>
        <p className="pp-sub">
          Three things a teacher's week is full of: scaffolding a lesson, writing questions at
          different levels, and drafting feedback. Everything below comes out as a draft —
          nothing here grades a student, and nothing goes out until you've read and edited it.
        </p>
      </div>

      <div className="pp-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`pp-tab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="pp-panel">
        {tab === "lesson" && (
          <>
            <h2>Lesson scaffold</h2>
            <p className="pp-hint">Give it a topic and it drafts objective, starter, main activity, plenary, and materials.</p>
            <div className="pp-form">
              <div className="pp-row">
                <Field label="Subject">
                  <input value={lesson.subject} onChange={(e) => setLesson({ ...lesson, subject: e.target.value })} placeholder="e.g. Chemistry" />
                </Field>
                <Field label="Student level">
                  <input value={lesson.level} onChange={(e) => setLesson({ ...lesson, level: e.target.value })} placeholder="e.g. Year 10 / AS Level" />
                </Field>
              </div>
              <Field label="Topic">
                <input value={lesson.topic} onChange={(e) => setLesson({ ...lesson, topic: e.target.value })} placeholder="e.g. Rates of reaction — collision theory" />
              </Field>
              <Field label="Lesson length">
                <input value={lesson.duration} onChange={(e) => setLesson({ ...lesson, duration: e.target.value })} placeholder="e.g. 50 min" />
              </Field>
              <button className="pp-btn" onClick={generateLesson} disabled={lessonLoading || !lesson.topic.trim()}>
                {lessonLoading ? <Loader2 size={16} className="pp-spin" /> : <PenLine size={16} />}
                {lessonLoading ? "Drafting..." : "Draft lesson"}
              </button>
              {lessonError && <div className="pp-error">{lessonError}</div>}
            </div>
            {lessonOut && (
              <DraftPaper
                text={lessonOut}
                onChange={setLessonOut}
                reviewed={lessonReviewed}
                onReviewed={setLessonReviewed}
              />
            )}
          </>
        )}

        {tab === "questions" && (
          <>
            <h2>Question variants</h2>
            <p className="pp-hint">Give it one concept and it drafts four versions of a question testing that concept, from easy to stretch.</p>
            <div className="pp-form">
              <Field label="Topic">
                <input value={q.topic} onChange={(e) => setQ({ ...q, topic: e.target.value })} placeholder="e.g. Mechanics" />
              </Field>
              <Field label="Concept to test">
                <textarea rows={2} value={q.concept} onChange={(e) => setQ({ ...q, concept: e.target.value })} placeholder="e.g. Applying F = ma to a system of two connected masses" />
              </Field>
              <button className="pp-btn" onClick={generateQuestions} disabled={qLoading || !q.concept.trim()}>
                {qLoading ? <Loader2 size={16} className="pp-spin" /> : <PenLine size={16} />}
                {qLoading ? "Drafting..." : "Generate variants"}
              </button>
              {qError && <div className="pp-error">{qError}</div>}
            </div>
            {qOut && (
              <div className="pp-qgrid">
                {["easy", "medium", "hard", "stretch"].map((lvl) => (
                  <div className="pp-qcard" key={lvl}>
                    <span className="pp-qcard-label">{lvl}</span>
                    <textarea
                      value={qOut[lvl] || ""}
                      onChange={(e) => setQOut({ ...qOut, [lvl]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "feedback" && (
          <>
            <h2>Feedback draft</h2>
            <p className="pp-hint">Paste or photograph one student's work. It drafts a strength, an area to improve, and a next step — never a grade.</p>
            <div className="pp-form">
              <div className="pp-row">
                <Field label="Assignment context">
                  <input value={fb.context} onChange={(e) => setFb({ ...fb, context: e.target.value })} placeholder="e.g. Short answer on Le Chatelier's principle" />
                </Field>
                <Field label="Focus feedback on (optional)">
                  <input value={fb.focus} onChange={(e) => setFb({ ...fb, focus: e.target.value })} placeholder="e.g. use of correct terminology" />
                </Field>
              </div>
              <Field label="Student's work (typed, optional if you attach photos)">
                <textarea rows={5} value={fb.work} onChange={(e) => setFb({ ...fb, work: e.target.value })} placeholder="Paste the student's answer here..." />
              </Field>

              <div className="pp-field">
                <span>Photos of the work (optional)</span>
                <div className="pp-upload-row">
                  {fbImages.map((img, i) => (
                    <div className="pp-thumb" key={i}>
                      <img src={img.previewUrl} alt={img.name} />
                      <button type="button" className="pp-thumb-remove" onClick={() => removeFbImage(i)} aria-label={`Remove ${img.name}`}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {fbImages.length < 4 && (
                    <label className="pp-upload-btn">
                      <ImagePlus size={18} />
                      <span>Add photo</span>
                      <input type="file" accept="image/*" multiple onChange={handleFbImageUpload} hidden />
                    </label>
                  )}
                </div>
              </div>

              <button className="pp-btn" onClick={generateFeedback} disabled={fbLoading || (!fb.work.trim() && fbImages.length === 0)}>
                {fbLoading ? <Loader2 size={16} className="pp-spin" /> : <PenLine size={16} />}
                {fbLoading ? "Drafting..." : "Draft feedback"}
              </button>
              {fbError && <div className="pp-error">{fbError}</div>}
            </div>
            {fbOut && (
              <DraftPaper
                text={fbOut}
                onChange={setFbOut}
                reviewed={fbReviewed}
                onReviewed={setFbReviewed}
              />
            )}
          </>
        )}
      </div>

      <div className="pp-foot">
        <PenLine size={13} />
        Drafts, not decisions — you read, edit, and sign off on everything before it reaches a student.
      </div>
    </div>
  );
}
