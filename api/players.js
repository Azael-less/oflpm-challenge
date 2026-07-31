// api/players.js
// Lista de jugadores del reto OFLPM y la región donde juegan.
//
// Para pasar a NA más adelante: cambia PLATFORM a "na1"
// (REGIONAL se queda en "americas", ya cubre LAN y NA).
//
// "label" es el nombre que se muestra en la tarjeta si quieres que
// sea distinto al gameName real (opcional).
// "goalTier" define la meta personal. Valores: IRON, BRONZE, SILVER,
// GOLD, PLATINUM, EMERALD, DIAMOND, MASTER, GRANDMASTER o CHALLENGER.

const PLATFORM = "na1"; // LAN. Cuando migren a NA: "na1"
const REGIONAL = "americas"; // ruta regional para Account-v1 (LAN y NA usan "americas")

const PLAYERS = [
  { gameName: "bbquesauce", tagLine: "NA1", label: "akang", goalTier: "DIAMOND", startRank: { tier: "UNRANKED", rank: null, leaguePoints: 0 } },
  { gameName: "ABOODSN", tagLine: "NA1", label: "Junior es", goalTier: "PLATINUM", startRank: { tier: "UNRANKED", rank: null, leaguePoints: 0 } },
  { gameName: "Azael", tagLine: "333", label: "azael", goalTier: "MASTER", startRank: { tier: "UNRANKED", rank: null, leaguePoints: 0 } },
  { gameName: "EDG DaunzuII", tagLine: "NA1", label: "Loky", goalTier: "DIAMOND", startRank: { tier: "UNRANKED", rank: null, leaguePoints: 0 } },
  { gameName: "Optiboy", tagLine: "NA1", label: "jhon", goalTier: "MASTER", startRank: { tier: "UNRANKED", rank: null, leaguePoints: 0 } },
  { gameName: "pockydrr", tagLine: "NA1", label: "bigenius", goalTier: "MASTER", startRank: { tier: "UNRANKED", rank: null, leaguePoints: 0 } },
];

module.exports = { PLAYERS, PLATFORM, REGIONAL };

