# Workspace-guide

Guide för att använda det grafiska gränssnittet.

---

## Översikt

Workspace är ett modulärt gränssnitt byggt med FlexLayout. Paneler kan dockas, flyttas och storleksändras fritt.

### Moduler

| Modul | Beskrivning |
|-------|-------------|
| **Image Viewer** | Visar bilder med zoom och panorering |
| **Face Review** | Granska och bekräfta ansikten |
| **File Queue** | Hantera filkön |
| **Log Viewer** | Visa loggar |
| **Original View** | Jämför med originalfil |
| **Statistics** | Bearbetningsstatistik |
| **Importera** | Överför NEF från minneskort till målmapp och matar ut kortet |
| **Byt namn** | Döper om NEF efter EXIF CreateDate (YYMMDD_HHMMSS) med förhandsvisning |
| **Räkna spelare** | Räknar bilder per spelare (från filnamn) med över-/underrepresentation |
| **Gallra spelare** | Gallra bilder per spelare med förhandsvisning och papperskorg |
| **Database** | Databashantering |
| **Preferences** | Inställningar |
| **Theme Editor** | Anpassa utseende |

---

## Tangentbordsgenvägar

### Navigation

| Genväg | Funktion |
|--------|----------|
| `Cmd+←→↑↓` | Flytta fokus mellan paneler |
| `Tab` | Nästa ansikte/fält |
| `Shift+Tab` | Föregående ansikte/fält |

### Bildvisning

| Genväg | Funktion |
|--------|----------|
| `+` / `-` | Zooma in/ut (håll för kontinuerlig) |
| `=` | Återställ till 1:1 |
| `0` | Auto-anpassa till fönster |
| `B` | Visa/dölj bounding boxes |
| `b` | Växla enstaka/alla boxar |
| `c` / `C` | Aktivera/avaktivera auto-centrering |
| `Shift+I` | Visa/dölj "Review Progress" (filnamn + köstatus) |

*Review Progress finns även i menyn: View → Show Review Progress.*

### Ansiktsgranskning

| Genväg | Funktion |
|--------|----------|
| `Enter` / `A` | Acceptera föreslagen matchning |
| `Shift+Cmd+A` | Acceptera alla förslag i bilden |
| `i` | Ignorera ansikte |
| `r` | Byt namn / ange namn (rensar fältet) |
| `1-9` | Välj matchningsalternativ |
| `↑` / `↓` | Föregående/nästa ansikte |
| `Tab` | Komplettera autocomplete-förslag |
| `x` | Hoppa till nästa fil |
| `Esc` | Avbryt ändringar |

### Layout

| Genväg | Funktion |
|--------|----------|
| `Cmd+1` | Review Mode |
| `Cmd+2` | Comparison Mode |
| `Cmd+3` | Full Image |
| `Cmd+4` | Statistics Mode |
| `Cmd+5` | Queue Review Mode |
| `Cmd+Shift+]` | Lägg till kolumn |
| `Cmd+Shift+[` | Ta bort kolumn |

### Gallring (Gallra spelare)

| Genväg | Funktion |
|--------|----------|
| `↑` / `↓` (`k` / `j`) | Föregående/nästa bild i listan |
| `x` / `Delete` | Flytta bilden till papperskorgen och gå vidare |
| `Cmd+Z` | Ångra (återställ senast gallrade bild) |

### Allmänt

| Genväg | Funktion |
|--------|----------|
| `?` | Visa hjälp |
| `Cmd+O` | Öppna fil |
| `Cmd+Shift+I` | Importera |
| `Cmd+Shift+B` | Byt namn (NEF) |
| `Cmd+Shift+K` | Räkna spelare |
| `Cmd+Shift+G` | Gallra spelare |
| `Cmd+,` | Inställningar |
| `Cmd+S` | Spara ändringar |

---

## Kommandorad (CLI)

Appen kan öppnas från terminalen med `ansikten`-kommandot, som väljer rätt
arbetsflöde via ett subkommando. Är appen redan igång skickas argumenten till
det körande fönstret (rätt modul öppnas/fokuseras automatiskt).

```sh
ansikten faces *.NEF          # köa NEF för ansiktsgranskning och börja bearbeta
ansikten *.NEF                # samma sak — faces är standard när inget verb anges
ansikten culling MAPP         # öppna MAPP i Gallra spelare
ansikten cull MAPP            # alias för culling
```

**Mål (verb):**

| Verb | Arbetsmängd | Standard |
|------|-------------|----------|
| `faces` (standard) | Ansiktskön (filer) | Lägg till + börja bearbeta |
| `culling` / `cull` | Gallra-mappar (roots) | Lägg till mappen |

**`--clear` / `-c`** nollställer målets arbetsmängd *före* tillägg. Ensam (utan
sökväg) tömmer den bara:

```sh
ansikten faces --clear *.NEF      # töm ansiktskön, köa de nya filerna, starta
ansikten culling --clear MAPP     # ersätt gallrings-mapparna med MAPP
ansikten culling --clear          # töm gallrings-arbetsytan
```

Utan `--clear` är standard att **lägga till** i befintlig arbetsmängd.

**Installation:** kommandot är skriptet [`bin/ansikten`](../../bin/ansikten) i
repot. Länka in det i din PATH:

```sh
ln -s "$PWD/bin/ansikten" ~/bin/ansikten   # kör från repo-roten
```

Skriptet kräver att appen är installerad i `/Applications/Ansikten.app` (macOS).

---

## Arbetsflöde

> **Startsida:** När appen startar utan filer i kön visas en startsida i
> arbetsytan med knappar för arbetsflödesstegen i ordning (**Importera · Byt
> namn · Granska ansikten · Räkna spelare · Gallra spelare**). Varje knapp
> öppnar (eller fokuserar) respektive modul. **Importera** är aktiv bara när ett
> minneskort sitter i (uppdateras automatiskt) — övriga är alltid valbara.
> Startsidan försvinner så fort du öppnar en modul eller laddar en bild.

### 0. Importera från minneskort (valfritt)

1. Öppna **Importera** (`Cmd+Shift+I`). Modulen listar isatta minneskort med antal NEF.
2. Välj kort, målmapp (kom ihåg senaste), samt Flytta/Kopiera och om kortet ska matas ut.
3. Klicka **Importera** — en förloppsindikator visas; kortet matas ut efter felfri överföring.

### 0b. Byt namn på NEF (valfritt)

1. Öppna **Byt namn** (`Cmd+Shift+B`), välj mappen (ev. glob `DSC*`).
2. **Förhandsgranska** visar `DSC… → YYMMDD_HHMMSS.NEF` (dubbletter får `-NN`; filer utan CreateDate döps ej om).
3. **Byt namn** utför; befintliga målnamn skrivs aldrig över.

### 1. Lägg till filer

1. Klicka `+` i File Queue eller `Cmd+O`
2. Välj en eller flera NEF-filer
3. Filer läggs till i kön

### 2. Granska ansikten

1. Klicka på en fil i kön för att ladda den
2. Ansikten visas i Face Review-panelen
3. För varje ansikte:
   - **Acceptera** (`A`/`Enter`) om matchningen är korrekt
   - **Ignorera** (`I`) om ansiktet ska ignoreras
   - **Namnge** (`R` eller skriv i fältet) för nytt namn
   - **Välj alternativ** (`1-9`) för annan matchning

Längst ner i Face Review-panelen visas en **kööversikt** som en
färgad stapel över hela kön: grönt = granskade den här sessionen,
orange = förbearbetade (i cachen, snabba att öppna) men ännu inte
granskade, grått = återstår. Håll muspekaren över stapeln för exakta
antal.

### 3. Spara och fortsätt

1. När alla ansikten är granskade:
   - Auto-advance går till nästa fil (om aktiverat)
   - Eller klicka **Skip** för att hoppa vidare
2. Ändringar sparas automatiskt

### 4. Byt namn (valfritt)

1. När filer är granskade, klicka **Rename** i File Queue
2. Bekräfta namnbytet
3. Filer får nya namn enligt mönstret `YYMMDD_HHMMSS_Namn1,_Namn2.NEF`

### 5. Räkna och gallra spelare (på utvecklade jpg)

1. Öppna **Räkna spelare** (`Cmd+Shift+K`). Ange en mapp och/eller ett wildcard
   i balken högst upp, välj filtyp (vanligen `jpg / jpeg`) och ev. datum-span,
   och klicka **Räkna**. Tabellen visar antal bilder per spelare och avvikelse
   från medianen (grön/gul/röd). Statistiken uppdateras automatiskt när filer
   läggs till, tas bort eller byter namn i mappen.
2. Klicka på en spelare i tabellen för att öppna **Gallra spelare**
   (`Cmd+Shift+G`) filtrerad på den spelaren. Filtret kan finjusteras med
   spelar-menyn eller ett eget glob (t.ex. `*ArvidW*`) i balken. Välj filtyp
   (`jpg`/`nef`/`raw`) i balken — `nef`/`raw` används för allmän gallring på
   råfiler innan namn satts (förhandsvisas via NEF→JPG-konvertering;
   spelar-menyn är då tom och du filtrerar på mapp/datum/glob).
3. Bläddra i fillistan i mitten — `→`/`↓` nästa, `←`/`↑` föregående (`Alt`+pil
   hoppar 10 i taget); bilden visas maximerad till höger. **Högerklicka** en fil
   för en meny med navigering, byt namn, gallra och ångra — varje rad visar sitt
   kortkommando (så du lär dig genvägarna). Alla genvägar finns även i
   genvägshjälpen (`?`).
   Längst till vänster visas en **levande spelarräkning** för det aktuella
   urvalet som uppdateras direkt när du gallrar — så du ser hur varje spelares
   antal förändras. Tryck `x` (eller `Delete`) för att flytta bilden till
   papperskorgen och gå vidare. `Cmd+Z` ångrar.
   - **Byt namn på en fil:** tryck `Enter` på markerad fil (eller dubbelklicka)
     för att redigera filnamnet direkt i listan (filändelsen behålls). `Enter`
     bekräftar, `Esc` avbryter. Användbart när en utvecklad jpg har beskurits så
     att en namngiven spelare inte längre är med i bild. `.xmp`-sidecars följer
     med, och befintliga filnamn skrivs aldrig över.
4. Papperskorgen (knappen **Papperskorg**) listar gallrade bilder och återställer
   dem till ursprungsplatsen, eller tömmer permanent. En filtypsmeny (Alla / jpg /
   nef-raw) låter dig granska och återställa JPEG och råfiler separat; **Töm**
   tömmer då bara det filtrerade urvalet (allt när menyn står på Alla). Gallrade
   filer rensas
   automatiskt efter en konfigurerbar tid (standard 30 dagar; `0` = behåll för
   alltid), ställbart i **Preferences → Files → Trash (Gallra)**. Rensningen körs
   när backend startar och när papperskorgen öppnas.

---

## Inställningar

Öppna med `Cmd+,` eller via menyn.

### Kategorier

- **General** - Backend, tema, standardlayout
- **Layout** - Layoutmallar och rutnät
- **Image Viewer** - Zoom, panorering
- **Review** - Auto-save, bekräftelser, antal alternativ
- **Files** - Kö, namnbyte
- **Preprocessing** - Bakgrundsbearbetning, cache, rolling window
- **Dashboard** - Statistiksektioner
- **Advanced** - Loggning, debug-kategorier

### Rolling Window (Preprocessing)

Förhindrar att cachen fylls vid stora köer (1000+ bilder). Preprocessningen pausar automatiskt när tillräckligt många filer är redo, och återupptas när du granskat några.

| Inställning | Standard | Beskrivning |
|-------------|----------|-------------|
| **Max Ready Items** | 15 | Max antal preprocessade filer att hålla redo |
| **Pause Buffer** | 10 | Pausa när så här många är redo (bör vara märkbart mindre än Max Ready Items) |
| **Resume After** | 5 | Återuppta efter så många granskade |
| **Status Indicator** | På | Visa status i File Queue-footer |
| **Toast on Pause** | På | Visa meddelande vid paus |
| **Toast on Resume** | Av | Visa meddelande vid återstart |

---

## Tema

Välj tema i General-inställningar eller via Theme Editor (`Cmd+Shift+T`):

- **Light** (Terminal Beige) - Ljust retro-tema
- **Dark** (CRT Phosphor) - Mörkt CRT-tema
- **System** - Följer systemets inställning

Theme Editor ger full kontroll över färger och presets.

---

## Tips

1. **Snabb granskning**: Använd `1-9` för att snabbt välja matchningsalternativ
2. **Batch-läge**: Aktivera auto-advance för snabbare genomgång
3. **Fix-läge**: Aktivera för att omgranska redan bearbetade filer
4. **Stora köer**: Rolling Window hanterar 1000+ bilder utan att fylla minnet
5. **Ångra**: Använd Database-modulen för att ångra filändringar
6. **Autocomplete**: Använd `↑`/`↓` för att bläddra i förslag och `Tab` för att komplettera valt namn
7. **Database-filter**: I Database-modulen finns ett filterfält ("Filter names...") med fuzzy-matchning
