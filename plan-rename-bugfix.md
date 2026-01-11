# Plan: Rename bugfix – manuella ansikten saknas

## Problem

Filen `260111_080910_Aryan.NEF` har:
- **Aryan** – auto-detekterad och bekräftad
- **Elis** – manuellt tillagd

Men rename ger endast `260111_080910_Aryan.NEF`, inte `260111_080910_Aryan,_Elis.NEF`.

## Rotorsak

`collect_persons_for_files` använder en **exklusiv prioritetsordning**:

1. Sök i `known_faces` (encodings.pkl) via filnamn
2. Sök i `known_faces` via hash  
3. Fallback till `attempt_stats.jsonl`

Problemet: om steg 1 eller 2 hittar något, körs aldrig steg 3. Manuella ansikten lagras **endast** i attempt_stats (via `mark-review-complete`), inte i encodings. Därför ignoreras de helt om filen har minst ett auto-detekterat ansikte.

## Lösning

### Steg 1: Ändra `collect_persons_for_files` (merge + dedupe)

**Fil:** `backend/api/services/rename_service.py`

Ny logik:
1. Om filen finns i `attempt_stats` med `review_results == "ok"` → börja med dessa namn (bevarar review-ordning)
2. Komplettera med namn från `known_faces` som inte redan finns (dedupe)
3. Om ingen attempt_stats finns → använd encodings som idag

Detta säkerställer:
- Review-ordning bevaras (manual faces inkluderade)
- Auto-detekterade namn som inte granskades läggs till
- Bakåtkompatibilitet för filer utan review

### Steg 2: Spara manual faces i `known_faces`

**Fil:** `backend/api/services/detection_service.py`

Ändra `confirm_identity` så att manual faces (face_id starts with `manual_`) sparas i `known_faces` med `encoding: None`, precis som CLI:s `handle_manual_add` gör.

Detta ger:
- Datakonsistens mellan API och CLI
- Manual faces syns i databashantering
- Redundans om attempt_stats roteras bort

### Steg 3: Synka CLI-versionen

**Fil:** `backend/hitta_ansikten.py`

Uppdatera `collect_persons_for_files` med samma merge-logik för CLI-paritet.

## Edge cases

| Scenario | Förväntat beteende |
|----------|-------------------|
| Auto + manual faces | Båda i filnamn, review-ordning |
| Endast manual faces | Manual face i filnamn |
| Endast auto faces | Fungerar som idag |
| Ingen review (bara encodings) | Fungerar som idag |
| Fil omdöpt (hash lookup) | Hash-match ska fungera |

## Verifiering

1. Testa: fil med Aryan (auto) + Elis (manual) → `YYMMDD_HHMMSS_Aryan,_Elis.NEF`
2. Testa: fil med endast manual face → namn inkluderas
3. Testa: fil utan review → encodings används
4. Kör befintliga tester (om några)

## Filer att ändra

- [x] `backend/api/services/rename_service.py` – merge-logik
- [x] `backend/api/services/detection_service.py` – spara manual faces
- [x] `backend/hitta_ansikten.py` – CLI-paritet
