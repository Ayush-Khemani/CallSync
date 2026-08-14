# CallSync Product Roadmap

CallSync should become a lightweight meeting CRM for high-value calls, not another generic scheduling form. The product promise is:

> Turn interested replies into booked, prepared, and followed-up meetings.

## Product Problem

People do not need another way to create a calendar event. Google Calendar, Outlook, Calendly, Cal.com, ChatGPT, Gemini, and Copilot already help with that.

The pain CallSync should own is the messy gap between "yes, let's talk" and a meeting that actually happens, has context, and leads to a next step.

## Target Customer

Start with users who lose real value when meetings slip:

- Solo founders managing investor, customer, advisor, and hiring calls
- Consultants and agencies managing client discovery and onboarding calls
- Sales operators managing early pipeline before a heavyweight CRM is necessary
- Recruiters and hiring managers managing candidate screens

## Product Principles

- Meeting lifecycle over calendar utility
- Host control over exposed availability
- Fewer blank forms, more assisted setup
- Every invite has a status
- Every important meeting should have context before and an outcome after
- AI should remove coordination work, not become a vague chatbot

## Stage 1: Meeting Pipeline Foundation

Goal: Make CallSync feel like a workspace for managing meeting opportunities.

Tasks:

- Rename the dashboard concept from simple meetings to a meeting pipeline
- Group meetings by status: needs follow-up, link sent, booked, closed
- Surface follow-up risk for pending invites
- Keep copy/open/cancel actions visible
- Add useful empty states that explain what happens next

Acceptance:

- A host can understand which meeting invites need attention without opening every row
- The app feels like it tracks meeting progress, not only scheduled events

## Stage 2: Assisted Meeting Creation

Goal: Reduce manual setup and make every link feel purpose-built.

Tasks:

- Add an assistant prompt for creating a meeting request from natural language
- Add production templates for founder sales, investor intros, recruiting screens, and client onboarding
- Generate duration, buffer, working hours, questions, and invite copy from the chosen intent
- Keep the generated meeting brief visible while the host selects slots

Acceptance:

- A host can start from intent instead of a blank form
- Meeting setup communicates why the call exists, not only when it can happen

## Stage 3: Persistent Meeting Briefs

Goal: Store context so the meeting remains useful after the link is created.

Tasks:

- Add meeting fields for type, goal, invite message, qualification questions, and internal notes
- Store guest answers during booking
- Show the meeting brief on the host dashboard
- Show guest-facing questions on the public booking page

Acceptance:

- Every booked meeting has enough context for the host to prepare
- The booking page collects useful qualification data

## Stage 4: Follow-Up Workflow

Goal: Help users recover meetings that would otherwise disappear.

Tasks:

- Add follow-up status and timestamps
- Generate copyable follow-up messages
- Add "mark followed up" action
- Add reminder rules for stale pending invites
- Later: send follow-ups through connected Gmail/Outlook

Acceptance:

- Pending invites do not silently sit in the system
- The host knows exactly who needs a nudge and what to say

## Stage 5: Pre-Call Brief And Outcome Tracking

Goal: Make CallSync valuable before and after the meeting.

Tasks:

- Add pre-call brief view for upcoming booked meetings
- Include guest answers, meeting goal, suggested agenda, and opening prompt
- Add post-call outcome fields: happened, useful, next step, follow-up date
- Add dashboard filters for next actions

Acceptance:

- Hosts enter calls prepared
- Meetings produce trackable outcomes instead of disappearing into the calendar

## Stage 6: AI And Integrations

Goal: Connect the workflow to real communication and calendar systems.

Tasks:

- Add real AI generation endpoint for meeting brief creation
- Connect Gmail/Outlook sending for invites and follow-ups
- Add calendar conflict explanations and smarter slot ranking
- Add analytics: booking rate, follow-up rate, meeting outcome rate
- Add observability, billing readiness, and security review

Acceptance:

- CallSync becomes a persistent operating layer around meetings
- AI assists specific workflow steps instead of acting like a generic chat box
