# Ali, Wake Up

A short horror HTML game with a birthday twist.

This project was made as a **birthday gift** for Ali Shahrokhi.

> Built with the help of ChatGPT — and yes… it made me cry multiple times while trying to make it 😅  


# Play

You can play the game via this link <a href="https://amkharazi.github.io/Ali-Wake-Up/"> Link </a>
---

## Story

**Prologue — The Drive**

Ali is driving. Rain starts gently… then grows heavier.  
You blink too long.

The road glitches into stars and silence. The car floats.  
**CRASH** — everything turns white.

A final whisper:

**“Ali… wake up…”**

**Chapter 1 — Bunker Awakening**

You wake on cold concrete in **your bunker**. Your buddy (default **Hossein Choubin**) is nearby.  
Something feels rehearsed. Like everyone is reading lines from a script.

From here, you explore **Regions (A–D)**, visit character bunkers, build trust (or ruin it), collect clues, and trigger major events:
- disappearances (“they went to heaven…”)
- a red light in the sky
- an abandoned hospital maze
- a secret location reveal
- the final confrontation
- Tehran… your house… and the final wake-up

Then: work… and finally the **Happy Birthday** scene.

---

## Core gameplay loop

You survive by managing needs and exploring:

### Needs (start values)
- **Food / Water / Energy** start at **5**
- **Bladder / Resources / Keycard / Clues / Maps** start at **0**
- **Sanity** starts at **5**
- **Trust** starts at **0** (can go negative, can exceed 100)

### Your bunker (hub)
- **Toilet** → resets Bladder to 0
- **Desk** → eat/drink (Food/Water up to 10)
- **Bed** → sleep (Energy to 10, advances day)

### World locations
- **Regions A–D**: character bunkers (A1, A2, …) mapped to people
- **Lake**: fish for Food (costs Energy + Water)
- **Spring**: gain Water (costs Energy)
- **Scrapyard**: gain Resources (costs Energy + Food + Water)

### Trust & bunkers
In each character bunker you can:
- **Help** (give resources) → increases trust
- **Steal** (risk) → may succeed/fail (trust drops harder on failure)
- **Search** → chance to find **clues**

Trust increases your “luck” in many places (more gains, smoother progress, etc.).

### Collapse rules
If **Food / Water / Energy / Sanity** goes too low, you may **faint** and wake up **next morning in your bunker**.

---

## Characters

Your profile is chosen at the start:

- **Player name:** Ali Shahrokhi  
- **Age:** default 27  
- **Job:** SnapPay QA / Digipay QA / Other (default SnapPay QA)
- **Buddy (best friend):** default Hossein Choubin  
- **Villain (nemesis):** default Dr. Mansoor Rezghi  

Other characters you can meet (mapped into Region bunkers):
- Mahdi Amiri
- Maryam Pakseresht
- Amir Mohammad Kharazi
- Hesam Farhang
- Hossein Eyvazi
- Mohammad Badzohreh
- Amir Adabi
- Ali Khangoli
- Hanieh Esmaeli
- Alireza
- Mohammad Hossein Soltani
- Mahdi
- Erfaneh
- Reza Dehghani
- Faranak
- Mojtaba
- Usain
- M,arshall Mathers
- Rana Aszizzadeh
- Erfan
- Sepandar

---

## Audio

Ambient sound plays based on game state:
- Dark ambient loop during the horror game
- Happy ambient when you finish (birthday finale)

If audio does not start, it’s usually due to **browser autoplay restrictions**.  
Click anywhere once (Start / any button) to allow audio.

> Note: Some browsers also restrict remote audio when opening via `file://`. If you run into that, open the folder with any tiny local server.

---

## Cheats / Terminal

Open the **Terminal** button and type:

- `help`  
  Shows available commands.

- `happy birthday`  
  Instantly jumps to the birthday finale.

- `goto finale`  
  Skips to the villain kill scene and continues the remaining story.

---

## Assets

### Backgrounds
Background images are in:

`assets/bg/`

Version 3 includes built-in spooky PNGs (no external links required).

### Avatars
Avatars are in:

`assets/avatars/`

This project includes `_placeholder.png` and also copies of it for each character filename.  
You can replace any of them with real images later (same filename, `.png`).

A complete list of expected avatar filenames is included in:

`AVATARS_TO_ADD.txt`

---

## Save / Reset

Progress is saved in **localStorage** on your browser/device.  
Use **Settings → Reset** to start over.

---

## Bugs / Issues

If you find any bug, let me know — or open an issue on the project repository.

Thank you for playing.  
