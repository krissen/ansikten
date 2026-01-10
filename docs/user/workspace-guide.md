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

### Allmänt

| Genväg | Funktion |
|--------|----------|
| `?` | Visa hjälp |
| `Cmd+O` | Öppna fil |
| `Cmd+,` | Inställningar |
| `Cmd+S` | Spara ändringar |

---

## Arbetsflöde

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

### 3. Spara och fortsätt

1. När alla ansikten är granskade:
   - Auto-advance går till nästa fil (om aktiverat)
   - Eller klicka **Skip** för att hoppa vidare
2. Ändringar sparas automatiskt

### 4. Byt namn (valfritt)

1. När filer är granskade, klicka **Rename** i File Queue
2. Bekräfta namnbytet
3. Filer får nya namn enligt mönstret `YYMMDD_HHMMSS_Namn1,_Namn2.NEF`

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
