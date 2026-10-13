# ADHS Tasker - TODO

## Now

- **[BUG]** `/settings` route fehlt - im Navbar verlinkt, gibt 404
- **[BUG]** Overdue-Status wird nie gesetzt - `TaskStatus.Overdue` existiert im Enum, aber kein Code setzt ihn automatisch; abgelaufene Tasks bleiben auf `pending`
- **[DEBT]** `test.ts` im Root löschen - Datei enthält JWT-Tokens, kein Teil des Projekts
- **[DEBT]** Veraltete "Chat"-Kommentare im Code aufräumen (Copy-Paste-Artefakte, referenzieren Features die es nie gab)

## Soon

- **[FEATURE]** Settings-Seite - Erinnerungszeit (Minuten vor Task), Focus Mode Toggle, Dark Mode, OpenAI-Key Eingabe
- **[FEATURE]** Erinnerungsbenachrichtigungen verdrahten - DB-Schema existiert, Browser-Notifications sind nicht implementiert
- **[FEATURE]** Overdue-Handling - automatischer Statuswechsel nach Ablauf der Aufgabenzeit + Benachrichtigung
- **[FEATURE]** Produktivitäts-Dashboard - Rückblick auf Abschlussraten, Muster nach Tageszeit und Priorität, Trends über die Woche
- **[FEATURE]** Google One Tap - schnellerer Login neben normalem "Mit Google anmelden"-Button
- **[FEATURE]** ADHS-UX-Audit - systematisch prüfen: wo muss der Nutzer unnötige Entscheidungen treffen? Wo fehlt Feedback? Wo ist die UI ablenkend?
- **[FEATURE]** AI-Planungsassistent - KI hilft beim Aufbau des Tagesplans (priorisieren, realistisch einplanen, Pausen vorschlagen); nutzt `openaiKey` aus User-Settings. Scope muss vor Implementierung durchdacht werden.
- **[FEATURE]** AI-Tipps - kontextuelle ADHS-Hinweise während der Planung (z.B. "Duschen abends ist besser weil..."). Redaktionell + KI-generiert.

## Later

- **[FEATURE]** Google Calendar Sync - Zwei-Wege-Synchronisation (Tasks ↔ Google Calendar). Killer-Feature, hohe Komplexität - Design zuerst.
- **[FEATURE]** PWA / Mobile - installierbare PWA, optimiert für Telefon-Nutzung (wichtig für "immer offen, immer sichtbar")
- **[FEATURE]** Recurring Tasks - täglich/wöchentlich wiederkehrende Aufgaben automatisch eintragen
- **[FEATURE]** Tiefere AI-Integration - weitere KI-Anwendungsfälle über Planung und Tipps hinaus (offen)
- **[FEATURE]** "Ich stecke fest"-Button - Notfall-Schaltfläche während aktiver Task: 5 Min Pause / Task kleiner machen / Task überspringen; adressiert Task-Paralyse im Moment des Einfrierens
- **[FEATURE]** Next-Task-Preview - ~2 Minuten vor Ende der aktuellen Task wird die nächste leise eingeblendet; reduziert Entscheidungsparalyse beim Übergang
- **[FEATURE]** Hyperfokus-Alarm - deutlicherer Audio/Visuell-Alarm wenn Task signifikant überzogen wird (+50% geplante Zeit); Ergänzung zu Overdue-Handling gegen Zeitblindheit
- **[FEATURE]** Adaptives Verhaltensmodell - lernt aus tatsächlichem Verhalten über Zeit (Muster bei welchen Uhrzeiten Tasks erledigt werden, Verschlafen-Tage erkennen) und passt zukünftige Planung automatisch an
- **[FEATURE]** Crisis Mode - erkennt Überwältigungs-Muster (viele Skips, lange Inaktivität, wiederholtes "Ich stecke fest") und schaltet auf reduzierten Ein-Task-Modus um; verhindert Scham-Spiralen-Effekt
- **[FEATURE]** Capture Inbox - Gedanken und Tasks blitzschnell festhalten ohne aktuellen Fokus zu brechen; Zugangswege: Keyboard-Shortcut (`Shift+Space`), Spracheingabe (Web Speech API / Whisper), OS-Hotkey via Tauri, PWA Manifest Shortcuts, Web Share Target API
- **[FEATURE]** Anti-Context-Switch-Scheduler - Tasks bekommen kognitiven Typ (Deep Work/Admin/Kommunikation/Körperlich/Kreativ); Scheduler warnt bei zu vielen Typwechseln im Tagesplan und schlägt Umgruppierungen vor
