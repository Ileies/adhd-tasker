# TODO

## Broken / Immediate Fixes

- [ ] **`/settings` route fehlt** - im Navbar verlinkt, gibt aber 404. Muss erstellt werden.
- [ ] **Overdue-Status wird nie gesetzt** - `TaskStatus.Overdue` existiert im Enum, aber kein Code setzt ihn automatisch. Tasks die abgelaufen sind bleiben auf `pending`.
- [ ] **`test.ts` löschen** - Datei im Root mit JWT-Tokens, kein Teil des Projekts.
- [ ] **Veraltete Kommentare im Code** - Referenzen auf "Chat"-Features die es nie gab (Copy-Paste-Artefakte). Aufräumen.

## Hoch (Kern-Vision)

- [ ] **Settings-Seite** - Erinnerungszeit (Minuten vor Aufgabe), Focus Mode Toggle, Dark Mode (derzeit nur lokal), OpenAI-Key Eingabe
- [ ] **Erinnerungsbenachrichtigungen verdrahten** - DB-Schema existiert, Browser-Notifications sind nicht implementiert
- [ ] **Produktivitäts-Dashboard** - Rückblick auf Abschlussraten, Muster nach Tageszeit und Priorität, Trends über die Woche
- [ ] **Google Calendar Sync** - Zwei-Wege-Synchronisation (Tasks ↔ Google Calendar-Einträge). Killer-Feature, hohe Komplexität - Design zuerst.
- [ ] **Overdue-Handling** - Automatischer Statuswechsel nach Ablauf der Aufgabenzeit + Benachrichtigung

## Mittel

- [ ] **Google One Tap** - Schnellerer Login neben dem normalen "Mit Google anmelden"-Button
- [ ] **ADHS-UX-Audit** - Systematisch prüfen: Wo muss der Nutzer unnötige Entscheidungen treffen? Wo fehlt Feedback? Wo ist die UI ablenkend statt fokussierend?
- [ ] **AI-Planungsassistent** - KI hilft beim Aufbau des Tagesplans (Aufgaben priorisieren, realistisch einplanen, Pausen vorschlagen). Nutzt `openaiKey` aus User-Settings. Scope muss vor Implementierung durchdacht werden.
- [ ] **AI-Tipps** - Kontextuelle ADHS-spezifische Hinweise während der Planung (z.B. "Duschen abends ist besser weil..."). Separate Liste, redaktionell + KI-generiert.

## Niedrig / Zukunft

- [ ] **PWA / Mobile** - App als installierbare PWA, optimiert für Telefon-Nutzung (wichtig für "immer offen, immer sichtbar")
- [ ] **Tiefere AI-Integration** - Weitere KI-Anwendungsfälle über Planung und Tipps hinaus (offen)
- [ ] **Recurring Tasks** - Aufgaben die täglich/wöchentlich wiederkehren automatisch eintragen

## Ideen & Exploratives

- [ ] **"Ich stecke fest"-Button** - Notfall-Schaltfläche während der aktiven Task. Öffnet eine kleine Auswahl: *5 Min Pause*, *Task kleiner machen*, *Task überspringen*. Adressiert Task-Paralyse direkt im Moment des Einfrierens.
- [ ] **Next-Task-Preview** - Wenn die aktuelle Aufgabe ~2 Minuten vor Ende ist, blendet das Display leise ein, was als nächstes kommt. Reduziert Entscheidungsparalyse beim Übergang.
- [ ] **Hyperfokus-Alarm** - Deutlicherer Audio/Visuell-Alarm wenn eine Task signifikant überzogen wird (z.B. +50% der geplanten Zeit). Ergänzung zu Overdue-Handling, speziell gegen Zeitblindheit.
- [ ] **Adaptives Verhaltensmodell** - Der Tasker lernt über Zeit aus dem tatsächlichen Verhalten des Nutzers. Wenn geplante Tasks systematisch zu bestimmten Uhrzeiten erledigt werden (z.B. 7-Uhr-Task erst um 11 Uhr), erkennt das System Muster und passt zukünftige Planung automatisch an. Beispiel: Nutzer hat verschlafen - System schaut, wie frühere Verschlafen-Tage verliefen, und schlägt eine angepasste Tagesroutine vor. Baut auf dem Produktivitäts-Dashboard auf (historische Completion-Daten als Grundlage).
- [ ] **Crisis Mode** - Das System erkennt Überwältigungs-Muster: viele Task-Skips kurz hintereinander, lange Inaktivität, wiederholtes "Ich stecke fest". Ab einem Schwellenwert wechselt die App automatisch in einen reduzierten Modus - eine einzige Task sichtbar, alles andere ausgeblendet, erste Option ist "5 Minuten Pause". Verhindert den Scham-Spiralen-Effekt bei dem jeder weitere Misserfolg den nächsten wahrscheinlicher macht.
- [ ] **Capture Inbox** - Gedanken und Tasks blitzschnell festhalten ohne den aktuellen Fokus zu brechen. Alles landet in einer Inbox die erst beim nächsten Planungs-Moment geöffnet wird. Mehrere Zugangswege: Keyboard-Shortcut im Browser (`Shift+Space` o.ä.), Spracheingabe per Web Speech API (Whisper als optionales Upgrade via `openaiKey`), am Desktop per globalem OS-Shortcut via Tauri-Wrapper (Rust-Shell um die bestehende Web-App, registriert Hotkeys auf OS-Ebene), auf Mobile per PWA Manifest Shortcuts (Direktzugriff per Langer Druck auf Home-Screen-Icon) und Web Share Target API (Text aus jeder App direkt in die Inbox teilen). Kapazitiv einfach, aber plattformübergreifend komplex.
- [ ] **Anti-Context-Switch-Scheduler** *(niedrige Priorität)* - Tasks bekommen einen kognitiven Typ (Deep Work, Admin, Kommunikation, Körperlich, Kreativ). Der Scheduler erkennt wenn der Tagesplan viele Typwechsel enthält, warnt und schlägt Umgruppierungen vor. Context-Switching ist für ADHS-Nutzer unverhältnismäßig teuer.
