# Alarm App

Tids- och platslarm som körs helt på enheten. Expo SDK 57 · React Native 0.86 · Expo Router · expo-sqlite.

## Kom igång

Appen använder bakgrundsgeofencing, push, systemlarm och egna notisknappar – det fungerar inte i Expo Go.
Den behöver en **development build**.

### Enklast: bygg i molnet via expo.dev (ingen Xcode/Android Studio)

1. Koppla GitHub-repot till projektet på expo.dev.
2. Starta ett bygge: plattform, gren och profil `development` (Android ger en APK att installera direkt).
3. Skanna QR-koden med telefonen och installera.

Profiler i `eas.json`:

| Profil | Till för |
|---|---|
| `development` | Dev-klient för att testa på egen telefon |
| `preview` | Installerbar app för interna testare (Android APK) |
| `production` | Butiksversion (App Store / Google Play) |

iPhone kräver ett Apple Developer-konto (99 USD/år), oavsett byggsätt.

### Från terminalen

```sh
git clone https://github.com/Fatdevil/AlarmApp.git
cd AlarmApp
npm install
npx eas-cli login
npx eas-cli build --profile development --platform android   # eller ios
# alternativt lokalt: npx expo run:android / npx expo run:ios (kräver Android Studio / Xcode 26)
```

## Kontroller

```sh
npm run check   # typecheck + lint + tester
```

## Struktur

| Mapp | Innehåll |
|---|---|
| `app/(tabs)/` | Flikar: Väckning (väckarklocka) och Påminnelser |
| `app/` | Övriga skärmar: ny/ändra väckning, nytt larm, inställningar, diagnostik |
| `src/logic/` | Ren logik utan native-beroenden (tid, sektioner, validering) – enhetstestad |
| `src/services/` | Databas, notiser, geofencing, push och larmflöden (`alarms.ts`) |
| `src/components/` | UI-komponenter |
| `__tests__/` | Jest-tester |

Diagnostikvyn nås via Inställningar → tryck 7 gånger på versionsnumret (alltid synlig i dev-läge).

## Väckarklocka

Fliken **Väckning** fungerar som Klocka-appen: larm med på/av-reglage, veckodagar och etikett.
Utöver det:

- **Väckningsserie** – flera larm i rad (t.ex. 06:00 + var 10:e minut × 5) som skapas i ett steg.
- **Jag är vaken** – stänger av resten av seriens larm som skulle ringa inom tre timmar.
  På Android sker det automatiskt när man trycker "Jag är vaken" på larmskärmen, även om appen är stängd.
  På iOS (AlarmKit) görs det via knappen i appen.
- **Hoppa över nästa** (håll inne på ett larm) – nästa tillfälle ringer inte, sedan fortsätter larmet som vanligt.
- Engångslarm stängs av automatiskt när de har ringt.

Logiken finns i `src/logic/wake.ts` (ren och testad), flödena i `src/services/wake.ts`.

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
- [ ] Väckningsserie 3 × 2 min: tryck "Jag är vaken" på första larmet (Android) → resten ringer inte
- [ ] iOS: väckningsserie, tryck "Jag är vaken" i appen → resten ringer inte
- [ ] "Hoppa över nästa" på ett vardagslarm → ringer inte nästa gång, men gången därefter
- [ ] Engångsväckning visas som avstängd efter att den har ringt
- [ ] Platslarm "lämnar Jobbet" skapat hemma → larmar inte direkt; larmar först när du lämnar jobbet
- [ ] Platslarm "kommer hem" skapat hemma → larmar inte direkt; larmar när du går och kommer tillbaka
- [ ] Skapa/ta bort ett annat platslarm → befintliga platslarm larmar inte av omregistreringen
