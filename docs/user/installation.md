# Installation

Guide för att installera Hitta ansikten på din dator.

---

## Systemkrav

| Krav | Minimum |
|------|---------|
| **OS** | macOS 11+, Windows 10+, Ubuntu 20.04+ |
| **RAM** | 4 GB (8 GB rekommenderas) |
| **Disk** | 1 GB ledigt utrymme |
| **Processor** | 64-bit (x64 eller arm64) |

---

## Nedladdning

Hämta senaste versionen från [GitHub Releases](https://github.com/krissen/hitta_ansikten/releases/latest):

| Plattform | Fil |
|-----------|-----|
| macOS | `Bildvisare-X.X.X.dmg` eller `.zip` |
| Windows | `Bildvisare-Setup-X.X.X.exe` |
| Linux (Debian/Ubuntu) | `bildvisare_X.X.X_amd64.deb` |
| Linux (övriga) | `Bildvisare-X.X.X.AppImage` |

---

## macOS

### Installation

1. Ladda ner `.dmg`-filen
2. Dubbelklicka för att öppna
3. Dra "Bildvisare" till Applications-mappen
4. Stäng DMG-fönstret

### Första start

Vid första start kan macOS visa en varning:

> "Bildvisare" kan inte öppnas eftersom utvecklaren inte kan verifieras.

**Lösning:**
1. Öppna **Systeminställningar** → **Integritet och säkerhet**
2. Klicka "Öppna ändå" bredvid Bildvisare-varningen
3. Bekräfta i dialogrutan

---

## Windows

### Installation

1. Ladda ner `.exe`-filen
2. Dubbelklicka för att starta installationen
3. Följ installationsguiden
4. Välj installationsplats (standard rekommenderas)
5. Klicka "Installera"

### Första start

Windows Defender kan visa en varning:

> Windows har skyddat din dator

**Lösning:**
1. Klicka "Mer information"
2. Klicka "Kör ändå"

Appen startas från Start-menyn eller skrivbordsgenvägen.

---

## Linux

### Debian/Ubuntu (.deb)

```bash
# Installera paketet
sudo dpkg -i bildvisare_X.X.X_amd64.deb

# Installera beroenden om det behövs
sudo apt-get install -f
```

Starta från appmenyn eller kör `bildvisare` i terminalen.

### AppImage

```bash
# Gör filen körbar
chmod +x Bildvisare-X.X.X.AppImage

# Kör appen
./Bildvisare-X.X.X.AppImage
```

> **Tips:** Flytta AppImage till `/opt/` eller `~/Applications/` för permanent installation.

---

## Första konfiguration

### Backend-start

Backend-servern startar automatiskt när appen öppnas.

Om servern inte startar:
1. Öppna Log Viewer (`Cmd+L`)
2. Kontrollera felmeddelanden
3. Verifiera att port 5001 är ledig

### Anslut till databas

Vid första start skapas en tom databas i:
- **macOS/Linux:** `~/.local/share/faceid/`
- **Windows:** `%APPDATA%\faceid\`

---

## Avinstallation

### macOS

1. Dra Bildvisare från Applications till papperskorgen
2. Ta bort data (valfritt):
   ```bash
   rm -rf ~/.local/share/faceid/
   ```

### Windows

1. Öppna "Lägg till eller ta bort program"
2. Sök efter "Bildvisare"
3. Klicka "Avinstallera"

### Linux

```bash
# Debian/Ubuntu
sudo apt remove bildvisare

# Ta bort data (valfritt)
rm -rf ~/.local/share/faceid/
```

---

## Felsökning

### Appen startar inte

1. Kontrollera systemkraven
2. Starta om datorn
3. Ladda ner appen igen

### Backend-fel

```bash
# Kontrollera om port 5001 används
lsof -i :5001  # macOS/Linux
netstat -an | findstr 5001  # Windows
```

### Rapportera problem

Om problemen kvarstår, [öppna ett ärende på GitHub](https://github.com/krissen/hitta_ansikten/issues/new).

---

## Se även

- [Kom igång](getting-started.md) - Snabbstart för utveckling
- [Workspace-guide](workspace-guide.md) - Guide för gränssnittet
- [Tangentbordsgenvägar](keyboard-shortcuts.md) - Alla genvägar
