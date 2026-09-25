# Alarm App

Tids- och platslarm som körs helt på enheten. Expo SDK 57 · React Native 0.86 · Expo Router · expo-sqlite.

## Kom igång

Appen använder bakgrundsgeofencing, push och egna notisknappar – det fungerar inte i Expo Go.
Kör en **development build**:

```sh
npm install
npx expo run:ios       # eller: npx expo run:android
# alternativt molnbygge: eas build --profile development
```

## Kontroller

```sh
npm run check   # typecheck + lint + tester
```

## Struktur

| Mapp | Innehåll |
|---|---|
| `app/` | Skärmar (Expo Router): larmlista, nytt larm, inställningar, diagnostik |
| `src/logic/` | Ren logik utan native-beroenden (tid, sektioner, validering) – enhetstestad |
| `src/services/` | Databas, notiser, geofencing, push och larmflöden (`alarms.ts`) |
| `src/components/` | UI-komponenter |
| `__tests__/` | Jest-tester |

Diagnostikvyn nås via Inställningar → tryck 7 gånger på versionsnumret (alltid synlig i dev-läge).

## Systemlarm (`modules/native-alarm`)

Lokal Expo-modul som ger riktiga väckarklocke-larm i stället för notiser:

- **iOS 26+ – AlarmKit:** ringer i tyst läge och med Fokus, visas på låsskärmen och i Dynamic Island.
  Äldre iOS faller tillbaka till notiser (AlarmKit länkas svagt).
- **Android – `AlarmManager.setAlarmClock`:** exakt även i Doze, helskärmsvy över låsskärmen,
  ljud som upprepas tills man stänger av, Snooza 10 min, återställs efter omstart.

Om modulen saknas eller behörighet nekas används `expo-notifications` automatiskt.

### Testa på enhet (kan inte verifieras i CI)

- [ ] iOS 26: skapa larm om 1 min, lås telefonen, sätt tyst läge → larmet ringer i helskärm
- [ ] iOS 26: upprepat larm (vardagar) visas i systemets larmlista och kan stängas av
- [ ] iOS 17–18: larm faller tillbaka till notis, appen startar utan krasch
- [ ] Android 14+: larm om 1 min med skärmen släckt → helskärmsvy, ljud tills "Stäng av"
- [ ] Android: "Snooza" ringer igen efter 10 min
- [ ] Android: starta om telefonen → schemalagda larm ringer fortfarande
- [ ] Android: stäng av helskärmsnotiser i Inställningar → banner visas i appen
