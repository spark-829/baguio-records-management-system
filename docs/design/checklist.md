# Design checklist

Used by the designer agent before a UI change, the reviewer on UI diffs,
and the QA design checker. Each item cites `principles.md`. **Auto** means
`npm run design-check` finds it; the rest need eyes on a screenshot.

Severity for QA findings: **High** blocks a task or fails WCAG AA on a core
flow; **Medium** fails WCAG AA elsewhere or confuses users; **Low** polish.

## Run the automated half

```
npm run design-check                                  # public pages
RMS_EMAIL=records@rms-demo.test RMS_PASSWORD=... npm run design-check
npm run design-check -- --only /records,/reports       # just changed pages
npm run design-check -- --url http://localhost:3000    # local build
```

Needs Playwright with Chromium (`npm i -g playwright && npx playwright
install chromium` outside Claude cloud sessions). Use the right password:
failed sign-ins count toward the demo account lockout.

About two page loads per page (phone 375px and desktop 1280px), one at a
time. Exit code 1 when anything is found.

## Checks

| ID | Check | How | Source |
| --- | --- | --- | --- |
| axe:* | No WCAG 2.0–2.2 A/AA violations (contrast, names, labels, ARIA) | Auto | §2 |
| D-LAYOUT-1 | No sideways page scroll at 375px (tables scroll in their own box) | Auto | §2 1.4.10 |
| D-TARGET-1 | Targets ≥24px or spaced apart | Auto | §2 2.5.8 |
| D-TARGET-2 | Phone controls and menu links ≥44px | Auto | §5 |
| D-TYPE-1 | Form fields ≥16px text | Auto | §4 |
| D-TYPE-2 | No text under 15px | Auto | §5 |
| D-STRUCT-1/2 | One `h1`; heading levels not skipped | Auto | §2, §4 |
| D-ZOOM-1 | Zoom not blocked | Auto | §2 1.4.4 |
| D-TITLE-1 | Page `<title>` set | Auto | §4 |
| D-OBSCURE-1 | Sticky bars and the floating assistant never cover the focused field or the last content | Tab through; scroll to the bottom | §2 2.4.11 |
| D-STATUS-1 | Every action shows feedback (pending label, success, error) | Do the action | §1.1 |
| D-ERROR-1 | Errors in plain words, next to the field, focus moves to them | Submit empty / bad input | §1.9, §3 |
| D-LANG-1 | Office words, sentence case, no jargon; Filipino fits without overflow | Read both languages | §1.2, §3, §7 |
| D-CONSIST-1 | Same state = same word and colour on every page; one primary button per area | Compare pages | §1.4, §3 |
| D-HIER-1 | The page's main task is the most prominent thing; secondary info is quieter | Squint test on a screenshot | §5 |
| D-EMPTY-1 | Empty, very long and error states look intentional | Search for nothing; long subject | §4 |
| D-DESTROY-1 | Destructive actions are red, worded plainly and confirmed or undoable | Try delete / bin | §1.3, §3 |
| D-GENERIC-1 | No decoration-only cards, eyebrows, gradients or arrows | Screenshot review | §6 |
| D-WEIGHT-1 | Change adds no UI library, web font, large image or decorative client JS | Read the diff | §7 |

## Reporting

One line per finding: `ID / page / viewport / what is wrong / fix`, with a
screenshot only when the problem is visual. Log in `qa/findings.md` with a
QA number like any other finding.
