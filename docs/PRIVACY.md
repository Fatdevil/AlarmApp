# Integritetsregler

Dessa regler gäller för all kod i appen och för en framtida server. De ändras bara genom ett
uttryckligt beslut, och då uppdateras det här dokumentet och testet
`__tests__/privacy.test.ts` ("Inget lämnar telefonen") i samma ändring.

## 1. Platsen stannar på telefonen

Följande får **aldrig** lämna telefonen, varken till en server eller till en annan användare:

- aktuell position eller positionshistorik
- att du gått in i eller lämnat en zon, eller när
- om en zonbevakning är aktiv
- att ett larm ringt, snoozats eller missats
- vilka behörigheter appen har (plats, notiser, larm)
- sparade platser och deras koordinater

Det finns ingen inställning för att dela position och det ska inte heller byggas en. Funktionen
saknas tekniskt – i appen, i protokollet och i serverns databas.

## 2. Bara uttryckliga beslut delas

När vänlarm byggs får mottagarens telefon skicka **endast** följande, och bara när användaren
själv trycker på en knapp:

| Status | Innehåll |
|---|---|
| Godkänt | förfrågans ID |
| Avvisat | förfrågans ID, valfri kommentar |
| Klar | förfrågans ID, valfri kommentar |

- En zonhändelse, ett larm som ringer eller en app som startar får aldrig skicka något automatiskt.
- "Klar och meddela" erbjuds bara inne i appen, inte som knapp i platslarmets notis. Annars
  skulle tidpunkten för meddelandet avslöja när du passerade zonen.
- Servern ser bara förloppet Skickat → Godkänt/Avvisat → Klar (samt Återkallat och Utgånget).
  Den vet ingenting om vad som händer på telefonen mellan Godkänt och Klar.

## 3. Mottagaren väljer platsen

En avsändare kan föreslå "när du lämnar jobbet", men skickar inga koordinater. Mottagaren kopplar
förslaget till en egen sparad plats i samband med godkännandet. Koordinaterna finns bara hos mottagaren.

## 4. Inget tas emot utan verifierad avsändare

Push tas inte emot förrän det finns en server med inloggning som verifierar avsändaren och att
avsändaren är en godkänd vän. Pushnotisen är då bara en signal; förfrågan hämtas från servern.
Kommentarer visas inte i klartext på låsskärmen som standard.

## Läget i dag

- Appen har ingen server och skickar ingenting från telefonen. Testet ovan stoppar nätverksanrop,
  push-token och push-tasks i källkoden.
- Vänlarm finns bara som prototyp i diagnostikvyn ("Simulera vänlarm"). Push-tasken som äldre
  versioner registrerade avregistreras vid appstart.
- Den exporterade diagnostikloggen kan innehålla koordinater. Den lämnar bara telefonen när
  användaren själv delar den, och kan maskeras vid export.

## Innan vänlarm byggs (krav, inte önskemål)

- Inloggning, verifierade användare och radering av konto i appen
- Ömsesidigt godkända vänskaper; bara aktiva vänner kan skicka förfrågningar
- Blockera och anmäla, samt gräns för hur många förfrågningar som kan skickas
- Idempotenta förfrågningar (dubbla nätverksförsök skapar inte dubbla larm)
- Utgående status köas lokalt när telefonen saknar nät
- Integritetspolicy som beskriver exakt ovanstående
