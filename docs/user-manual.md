# User manual

## Signing in
Open the system, read the privacy notice, tick the box and sign in with the email and password from your administrator. Your name, role and office show at the top right. Sign out when you leave the desk.

- After 5 wrong passwords the account locks for 15 minutes. An administrator can unlock it sooner on the Users page.
- After 15 minutes without activity you are signed out automatically. A large "Are you still there?" message with a countdown appears a minute before. Press **Yes, keep me signed in** to stay.
- **My account** (top right) lets you turn on two-step sign-in with an authenticator app. Administrators should turn it on.
- **Help** (top menu) explains each task in short, plain steps.
- Every sign-in, record you open and file you download is logged.
- In lists, people's names are shortened (for example "J*** dela C***"). The full name shows when you open the record.

## Dashboard
Shows open and overdue records, what is waiting in your office (with how many days are left or how late it is), counts by status, and the latest registrations. **Assigned to me** lists the records your office head gave to you. Heads see **Not assigned** on waiting records that have no one yet. Click a number box to see the list behind it, or click any record to open it.

## Registering a document (records desk)
1. Click **Register**.
2. No scan? Skip to step 3. To scan, click **Scan document** and point the camera at the page, or upload a PDF, JPG or PNG from the office scanner. Then click **Read scan with AI**. Boxes filled by the assistant are highlighted. Scans go straight to the record and are not kept on the device; use **Retake** to scan again. For a PDF, the AI reads the first page.
2b. Got the letter as an email? Under **Or register an email (.eml file)**, drop or choose the saved email (Gmail: More, Download message; Outlook: File, Save as). The subject, sender, date, mode and message fill in and are highlighted, and PDF, JPG or PNG attachments are attached. Check the boxes, or press **Remove email** to start over. See `docs/email-intake.md` for automatic intake, which is not built yet.
3. Fill in or check every box unless it says (optional). Choose the **Transaction type**: citizen or client (G2C), government office (G2G) or business (G2B). Pick Government for letters from or to another government office. The assistant can make mistakes; you are responsible for what is saved.
4. Choose an office in **Send to office** if it should go somewhere right away, and set **Must be acted on by** if there is a deadline.
5. Click **Save and get tracking number**, or **Cancel** to leave without saving. Print the routing slip with **Print routing slip** and attach it to the paper copy. Its QR code opens the record.

Without a scan, fill the form by hand. Department staff can register outgoing documents from their own office.

## Receipt and online tracking for the sender
For an incoming document, open the record and click **Print receipt for the sender**. Give the receipt to the person who filed it. It shows the tracking number, a 6-character tracking code and a QR code.

Anyone with both the number and the code can open **/track** (no account needed) and see the document's status, the office that has it and the dates. Names, the subject, remarks and files are never shown there. For Confidential records the page only says the document is being processed. After 10 wrong tries in 15 minutes from the same computer, the page asks the person to wait.

## Client satisfaction survey
The receipt has a second QR code, **Rate our service**. The citizen can also press **Rate our service** on /track once the document is finished. The survey is anonymous: five agree/disagree questions, whether they saw the Citizen's Charter, and an optional comment. Each document can be rated once. Department heads (own office) and the records desk and admin (all offices) open **Reports**, then **Client satisfaction**, to see the answers for a month, download a CSV or print the report with lines for **Actions taken**. It is due at the City Human Resource Management Office by the 7th of the next month.

## Complaints
Register a complaint with the document type **Complaint**. The reply is due 72 hours after it is logged, and the record page shows the hours left, or in red how late it is. The clock stops when the record is finished or a reply is linked. /track and **Help** list other ways to complain: the OPACD online portal (opacd.baguio.gov.ph), PACD email (pacd.baguiogovph@gmail.com), Hotline 8888 and the Anti-Red Tape Authority (complaints@arta.gov.ph).

## Requests for copies (records desk, City Legal Office, offices)
The records desk registers a copy request with the document type **Request for copy**, then fills **About the copy**: tracking number of the record asked for (it must exist), pages, fee, owner or representative, and the ID and authorization checks (a representative needs the authorization letter or SPA). If the record asked for is confidential, the Data Privacy Officer must approve first. The Data Privacy Officer is the head of the City Legal Office (office code CLO; do not change that code). Flow: register, forward to the City Legal Office, the head marks it received and presses **Approve release (Data Privacy Officer)** or **Refuse release** (reason required), the request is sent back, then the records desk or the holding office presses **Record release** with the name of the person who received it and (for a confidential copy) the ID check. Not confidential: no approval is needed. Administrators cannot decide or release.

## Acting on a record
Open the record. The box at the top shows who has it now, what needs to be done, and how many days are left or how late it is.

**Assigning a person.** The office head (or the records desk) opens **Assign a person** at the top of **Take action**, picks a staff member of the office holding the record, and presses **Assign**. It is saved in the history. A confidential record can be assigned only to the office head. The assignment is cleared when the record is sent to another office. Administrators cannot assign.

Press **Add a note or send to another office** on the right. The list shows only the actions allowed for the record's status and your office:
- **Send back to …** returns it to the office that sent it.
- **Mark as received (the paper is here)** when a forwarded document arrives.
- **Start working on it** when work begins.
- **Add a note** to write what was done without changing the status.
- **Send to another office** to pass it on.
- **Mark as done**, **Mark as sent out** (sent out of the City), **File away (archive)** (records desk only).

Press **Save**. The system asks you to confirm before anything is saved. Every action appears in **History, actions and remarks** with your name and the time.

## Storage boxes (records desk)
- **Boxes** (top menu) lists every storage box with its room, shelf, years and number of records. **Add a box** suggests the next code, such as CGSO-2026-012. Write the same code on the box.
- On a box page, **Print label** gives an A6 label with the code, where the box is, what is inside and a QR code that opens the box page (staff sign-in needed). **Change details** edits the box.
- To file a paper copy, open the record and press **Put in a box** (or **Move to another box**) under Details, type the code on the label and confirm. Archived records can be moved too. Every move is saved in the record's history. **File away (archive)** has an optional box field too.
- On **Records**, the **Box code** filter lists the records in one box. Do not type personal details in a box's contents or notes: every signed-in staff member can read them.

## Sending out and delivery
- For a record the City sends out, **Mark as sent out** asks how it was sent (registered mail, courier, hand delivery, email or other) and the date sent. Registered mail and courier also need the tracking number from the receipt. The record then shows a **Sending** card.
- When the document arrives, the records desk or the sending office presses **Record delivery** on the **Sending** card and types who received it and the date. Then attach the signed receiving copy under **Attachments**. Delivery cannot be added after the record is filed away.

## Finding records
- **Records** page: type a word or a tracking number and press **Search**. **More ways to narrow the list** opens the other filters (person, status, office, dates, late only). **Download list (Excel)** saves the results.
- Under the search box, the buttons **All**, **Citizen (G2C)**, **Government (G2G)** and **Business (G2B)** show one transaction type at a time and keep the other filters.
- **Ask the assistant to find it**: type a sentence in the search box and press this button; what it looked for appears on screen.
- **Assistant**: ask questions in English or Taglish, such as "What documents came from Juan dela Cruz?" or "Nasaan na po yung voucher para sa drainage?" The assistant searches only records you are allowed to see and links each one.

## Reports (department heads, records desk, admin)
Choose a date range to see counts by status, office, type, transaction type (older records show as Not set) and month, and the overdue list. Use **Download list (Excel)** or **Print report**.

- **Office workload**: for each office, how many documents are not yet received, being worked on and late, the longest time one has stayed there, and the average time to finish in the last 90 days. Offices with late documents come first.
- **Standard time per step** (records desk only): the minutes the Citizen's Charter allows for registering, sending, receiving, assigning and starting work. In a record's history, a step that took longer (counted in office hours only) shows an amber **Slow** badge. **Use the Citizen's Charter times** restores 9, 5, 5, 5 and 5 minutes.
- **Released documents logbook** (records desk and office heads): the outgoing documents sent out on one day, with how they were sent, the courier tracking number and who received them. **Print logbook** adds a Signature column for the messenger; **Download CSV** opens in Excel. Office heads see their own office only.
- **Retention schedule** (records desk and admin): every finished record with its keep-until date, based on its kind of document and counted from the day it was finished. Records within 90 days of that date, or past it, are flagged for review. Nothing is deleted from this page.

## Administration
- **Users**: create accounts, set role and office, deactivate people who leave. You cannot deactivate yourself.
- **Audit log**: every change, download and AI suggestion, with who, when and IP. A green bar confirms the log has not been altered.
- **Access history**: sign-ins, failed attempts, records opened and files downloaded. Filter by user, tracking number or event. At the bottom, **Who accessed this person's records?** answers Data Privacy Act requests.
- **Bin**: records deleted by the records desk, with the reason. **Restore** puts one back.
- **Settings**: lockout, idle sign-out, download stamping, and whether Confidential records are kept out of AI.

## Deleting a record (records desk, admin)
Open the record and click **Delete this record…** at the bottom right, give a reason and confirm. The record disappears for everyone except administrators, who can restore it from the **Bin**.

## Downloaded files
Files open stamped "Viewed by your name, date and time". Do not share downloaded copies outside the office.
