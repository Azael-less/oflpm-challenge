(() => {
  const CFG = window.OFLPM_CONFIG;
  const board = document.getElementById("board");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const updatedAtEl = document.getElementById("updated-at");
  const countdownEl = document.getElementById("countdown");
  const errorBox = document.getElementById("error-box");
  const modal = document.getElementById("player-modal");
  const modalClose = document.getElementById("modal-close");
  const modalTitle = document.getElementById("modal-title");
  const modalSubtitle = document.getElementById("modal-subtitle");
  const modalOpgg = document.getElementById("modal-opgg");
  const modalBody = document.getElementById("modal-body");
  const awardsGrid = document.getElementById("awards-grid");
  const awardsDescription = document.getElementById("awards-description");
  const leaderboardView = document.getElementById("leaderboard-view");
  const awardsView = document.getElementById("awards-view");
  const viewTabs = document.querySelectorAll(".view-tab");
  const boardTitle = document.getElementById("board-title");
  const boardKicker = document.getElementById("board-kicker");
  const boardDescription = document.getElementById("board-description");
  const playsFeatured = document.getElementById("plays-featured");
  const playsCarousel = document.getElementById("plays-carousel");
  const playsPrev = document.getElementById("plays-prev");
  const playsNext = document.getElementById("plays-next");
  const playsUploadToggle = document.getElementById("plays-upload-toggle");
  const playUploadModal = document.getElementById("play-upload-modal");
  const playUploadClose = document.getElementById("play-upload-close");
  const playUploadForm = document.getElementById("play-upload-form");
  const playPlayer = document.getElementById("play-player");
  const playFile = document.getElementById("play-file");
  const playFileName = document.getElementById("play-file-name");
  const playUploadStatus = document.getElementById("play-upload-status");

  const TIER_LABELS = {
    IRON: "Hierro",
    BRONZE: "Bronce",
    SILVER: "Plata",
    GOLD: "Oro",
    PLATINUM: "Platino",
    EMERALD: "Esmeralda",
    DIAMOND: "Diamante",
    MASTER: "Maestro",
    GRANDMASTER: "Gran Maestro",
    CHALLENGER: "Retador",
  };
  const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
  const TIER_PROGRESS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
  const DIVISION_PROGRESS = { IV: 0, III: 0.25, II: 0.5, I: 0.75 };

  let nextUpdateAt = null;
  let countdownTimer = null;
  let currentPlayers = [];
  let currentPlays = [];
  let currentBoardMode = "progress";

  function tierClass(tier) {
    return `tier-${(tier || "").toLowerCase()}`;
  }

  function lpTrendKey(player) {
    return `oflpm_lp_${player.gameName}_${player.tagLine}`;
  }

  function computeTrend(player) {
    if (!player.ranked) return null;
    const key = lpTrendKey(player);
    const prev = localStorage.getItem(key);
    const current = player.ranked.leaguePoints;
    localStorage.setItem(key, String(current));
    if (prev === null) return null;
    const diff = current - Number(prev);
    if (diff === 0) return null;
    return diff;
  }

  function getTierIconPath(tier) {
    const normalized = (tier || "IRON").toUpperCase();
    const files = {
      IRON: "Iron.webp",
      BRONZE: "Bronze.webp",
      SILVER: "Silver.webp",
      GOLD: "Gold.webp",
      PLATINUM: "Platinum.webp",
      EMERALD: "Emerald.webp",
      DIAMOND: "Diamond.webp",
      MASTER: "Master.webp",
      GRANDMASTER: "Grandmaster.webp",
      CHALLENGER: "Challenger.webp",
    };
    return `/api/icons/Nueva%20carpeta/${files[normalized] || "Unranked.webp"}`;
  }

  function getChampionIconUrl(player, championName) {
    const versionMatch = (player.profileIconUrl || "").match(/\/cdn\/([^/]+)\//);
    const version = versionMatch ? versionMatch[1] : "14.1.1";
    const aliases = { "Kai'Sa": "Kaisa", "Cho'Gath": "Chogath", "Kha'Zix": "Khazix", "Vel'Koz": "Velkoz", "Rek'Sai": "RekSai", "Bel'Veth": "Belveth" };
    const championId = aliases[championName] || String(championName || "").replace(/[^a-zA-Z0-9]/g, "");
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championId}.png`;
  }
  function getItemIconUrl(player, itemId) {
    const versionMatch = (player.profileIconUrl || "").match(/\/cdn\/([^/]+)\//);
    const version = versionMatch ? versionMatch[1] : "14.1.1";
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
  }

  function formatMatchDuration(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(Math.floor(total % 60)).padStart(2, "0")}`;
  }
  function rankValue(rank) {
    if (!rank) return 0;
    const tierIndex = Math.max(0, TIER_PROGRESS.indexOf((rank.tier || "IRON").toUpperCase()));
    const divisionOffset = APEX.has((rank.tier || "").toUpperCase()) ? 0 : (DIVISION_PROGRESS[rank.rank] || 0);
    return tierIndex * 400 + divisionOffset * 400 + Math.max(0, Math.min(100, rank.leaguePoints || 0));
  }

  function getContestProgress(player) {
    if (!player.goalTier) return null;
    const goal = rankValue({ tier: player.goalTier, rank: "IV", leaguePoints: 0 });
    const current = player.ranked ? rankValue(player.ranked) : 0;
    if (goal <= 0) return null;
    // El ranking compara qué tan cerca está hoy cada jugador de su meta,
    // no solo los LP ganados desde el rango inicial configurado.
    return Math.max(0, Math.min(1, current / goal));
  }
  function getCurrentRankScore(player) {
    return rankValue(player.ranked);
  }
  function getGoalRoute(player) {
    const goalTier = (player.goalTier || "").toUpperCase();
    const goalIndex = TIER_PROGRESS.indexOf(goalTier);
    if (goalIndex === -1) return null;

    const isUnranked = !player.ranked;
    const currentTier = isUnranked ? "UNRANKED" : (player.ranked.tier || "IRON").toUpperCase();
    const currentIndex = isUnranked ? 0 : Math.max(0, TIER_PROGRESS.indexOf(currentTier));
    const currentDivision = isUnranked || APEX.has(currentTier) ? null : (player.ranked?.rank || "IV");
    const currentLp = Math.max(0, Math.min(100, player.ranked?.leaguePoints || 0));
    const currentLabel = isUnranked ? "Sin clasificar" : `${TIER_LABELS[currentTier] || currentTier}${currentDivision ? ` ${currentDivision}` : ""}`;

    if (currentIndex >= goalIndex) {
      return { goalTier, currentLabel, steps: [], complete: true };
    }

    const divisions = ["IV", "III", "II", "I"];
    const steps = [];
    for (let tierIndex = currentIndex; tierIndex < goalIndex; tierIndex += 1) {
      const tier = TIER_PROGRESS[tierIndex];
      if (APEX.has(tier)) continue;
      const firstDivision = tierIndex === currentIndex
        ? Math.max(0, divisions.indexOf(currentDivision || "IV"))
        : 0;

      for (let divisionIndex = firstDivision; divisionIndex < divisions.length; divisionIndex += 1) {
        steps.push({
          label: `${TIER_LABELS[tier]} ${divisions[divisionIndex]}`,
          fill: tierIndex === currentIndex && divisionIndex === firstDivision ? currentLp : 0,
          leagueStart: divisionIndex === 0,
        });
      }
    }
    return { goalTier, currentLabel, steps, complete: false };
  }

  function getGoalMarkup(player) {
    const route = getGoalRoute(player);
    if (!route) return '';

    const goalLabel = TIER_LABELS[route.goalTier] || route.goalTier;
    if (route.complete) {
      return `<span class="goal-progress goal-complete" aria-label="Meta cumplida: ${goalLabel}"><span class="goal-track"><span class="goal-segment"><span style="width: 100%"></span></span></span><span class="goal-target"><img src="${getTierIconPath(route.goalTier)}" alt="Meta cumplida: ${goalLabel}" /></span></span>`;
    }

    const visibleSteps = route.steps.slice(0, 10);
    const segments = visibleSteps.map((step) => `<span class="goal-segment${step.leagueStart ? " league-start" : ""}" aria-label="${step.label}"><span style="width: ${step.fill}%"></span></span>`).join("");
    return `<span class="goal-progress" aria-label="Ruta desde ${route.currentLabel} hacia ${goalLabel}"><span class="goal-track">${segments}</span><span class="goal-target"><img src="${getTierIconPath(route.goalTier)}" alt="Meta: ${goalLabel}" /></span></span>`;
  }
  function getTierBadgeMarkup(tier) {
    const normalized = (tier || "IRON").toUpperCase();
    const label = TIER_LABELS[normalized] || "Sin clasificar";
    return `<span class="tier-badge tier-badge--${normalized.toLowerCase()}" title="${label}"><img src="${getTierIconPath(tier)}" alt="${label}" /></span>`;
  }

  function renderRow(player, index) {
    const rank = index + 1;
    const topClass = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
    const trend = computeTrend(player);
    const goalHtml = getGoalMarkup(player);

    let tierHtml = `${getTierBadgeMarkup("UNRANKED")}<span class="tier-label">Sin clasificar</span>`;
    let lpHtml = `<span class="lp">—</span>`;
    let recordHtml = `<span class="record">Sin partidas</span>`;

    if (player.ranked) {
      const { tier, rank: division, leaguePoints, wins, losses, hotStreak } = player.ranked;
      const label = TIER_LABELS[tier] || tier;
      const divisionLabel = APEX.has(tier) ? "" : ` ${division}`;
      tierHtml = `
        ${getTierBadgeMarkup(tier)}
        <span class="tier-label">${label}${divisionLabel}</span>
        ${hotStreak ? '<span class="hotstreak">RACHA</span>' : ""}
      `;

      const trendHtml = trend
        ? `<span class="lp-trend ${trend > 0 ? "up" : "down"}">${trend > 0 ? "▲" : "▼"}${Math.abs(trend)}</span>`
        : "";
      lpHtml = `<span class="lp">${leaguePoints} LP</span>${trendHtml}`;

      const total = wins + losses;
      const winrate = total ? Math.round((wins / total) * 100) : 0;
      recordHtml = `<span class="record"><span class="w">${wins}G</span> · <span class="l">${losses}P</span> <span class="winrate">${winrate}%</span></span>`;
    }

    const row = document.createElement("article");
    row.className = `row ${topClass}`;
    row.style.animationDelay = `${index * 45}ms`;
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.innerHTML = `
      <span class="rank-num">${rank}</span>
      <span class="player">
        <img class="player-icon" src="${player.profileIconUrl}" alt="" loading="lazy" />
        <span class="player-names">
          <span class="player-name">${player.gameName}</span>
          <span class="player-tag">${player.label || "Jugador"} · #${player.tagLine}${player.activeGame ? ` <b class="in-game">EN PARTIDA · ${player.activeGame.queue}</b>` : ""}</span>
        </span>
      </span>
      <span class="tier">${tierHtml}</span>
      <span>${lpHtml}</span>
      <span>${recordHtml}</span>
      ${goalHtml}
    `;

    row.addEventListener("click", () => openPlayerModal(player));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPlayerModal(player);
      }
    });

    return row;
  }

  function renderBoard() {
    const players = [...currentPlayers];
    const isProgress = currentBoardMode === "progress";
    const ordered = isProgress
      ? players.sort((a, b) => {
          const progressDifference = (getContestProgress(b) ?? -1) - (getContestProgress(a) ?? -1);
          const rankDifference = getCurrentRankScore(b) - getCurrentRankScore(a);
          return progressDifference || rankDifference || (a.gameName || "").localeCompare(b.gameName || "");
        })
      : players.sort((a, b) => getCurrentRankScore(b) - getCurrentRankScore(a));
    const highestProgress = Math.max(...ordered.map((player) => getContestProgress(player) ?? 0));
    const showPodium = isProgress && highestProgress > 0;

    board.innerHTML = "";
    ordered.forEach((player, index) => {
      const li = document.createElement("li");
      li.appendChild(renderRow(player, index, showPodium));
      board.appendChild(li);
    });
  }

  function render(players) {
    currentPlayers = players;
    renderAwards(players);
    populatePlayPlayers(players);
    renderBoard();
  }

  function renderAwards(players) {
    const awardStats = (player) => player.awardStats || player.stats || {};
    const periodStatus = players.find((player) => player.awardStats)?.awardStats?.periodStatus;
    if (awardsDescription) {
      const pending = Math.max(0, ...players.map((player) => Number(awardStats(player).pendingMatches || 0)));
      awardsDescription.textContent = periodStatus === "sync-error"
        ? "No se pudo sincronizar Supabase; mostrando una vista limitada de partidas recientes."
        : pending
          ? `Historial del reto en sincronización: faltan hasta ${pending} partidas por registrar.`
          : "Partidas Solo/Dúo del reto: 30 de julio a 30 de agosto (hora Colombia).";
    }
    const playersWithStats = players.filter((player) => awardStats(player).matchesPlayed > 0);
    if (!playersWithStats.length) {
      awardsDescription.textContent = "Los premios aparecerán cuando Riot tenga partidas reales de los perfiles del reto.";
      awardsGrid.innerHTML = `<section class="awards-empty"><span class="section-kicker">Sin datos inventados</span><strong>El Salón de premios espera las primeras partidas.</strong><p>Cuando conectes los perfiles de NA, los ganadores se calcularán únicamente con estadísticas reales.</p></section>`;
      return;
    }
    const champion = (player) => awardStats(player).otpChampion;
    const otpScore = (player) => {
      const otp = champion(player);
      return otp ? otp.games * (otp.winRate / 100) : 0;
    };
    const roleData = (player, role) => awardStats(player).roleStats?.[role] || null;
    const roleScore = (player, role) => {
      const data = roleData(player, role);
      if (!data || data.games < 3) return -1;
      const winRate = (data.wins + 2) / (data.games + 4);
      const confidence = Math.min(data.games, 10) / 10;
      const kda = Math.min(Number(data.kda) / 5, 1);
      let impact;
      if (role === "UTILITY") impact = Math.min((data.visionPerMin / 1.5 + Number(data.kda) / 5) / 2, 1);
      else if (role === "JUNGLE") impact = Math.min((data.objectivesPerGame / 2.5 + Number(data.kda) / 5) / 2, 1);
      else if (role === "BOTTOM") impact = Math.min((data.damagePerMin / 650 + data.csPerMin / 8) / 2, 1);
      else impact = Math.min((data.damagePerMin / 600 + data.csPerMin / 7) / 2, 1);
      return winRate * .55 + confidence * .2 + kda * .15 + impact * .1;
    };
    const makeRoleAward = (label, symbol, role) => ({
      label, symbol, unit: "partidas", category: "roles",
      value: (player) => roleData(player, role)?.games || 0,
      score: (player) => roleScore(player, role),
      detail: (player) => { const data = roleData(player, role); return data ? `${data.topChampion?.name || "—"} · ${data.games} partidas · ${data.winRate}% WR` : "Mínimo 3 partidas en el rol."; },
      modalDetail: (player) => { const data = roleData(player, role); return data ? `${data.games} partidas · ${data.winRate}% WR · ${data.kda} KDA · campeón más usado: ${data.topChampion?.name || "—"}.` : "Sin suficientes partidas en este rol."; },
    });
    const awards = [
      { label: "Rey del pentakill", symbol: "♛", unit: "pentakills", value: (p) => awardStats(p).pentakills || 0, detail: () => "Instinto de ejecución en las partidas recientes.", modalDetail: (p) => `${awardStats(p).pentakills || 0} pentakills en ${awardStats(p).matchesPlayed} partidas.` },
      { label: "Maestro de la cuadra", symbol: "✦", unit: "cuadras", value: (p) => awardStats(p).quadras || 0, detail: () => "A un paso de borrar al equipo rival.", modalDetail: (p) => `${awardStats(p).quadras || 0} cuadras registradas en la vista previa.` },
      { label: "Mayor soporte", symbol: "+", unit: "asistencias", value: (p) => awardStats(p).assists || 0, detail: () => "Más asistencias acumuladas en las partidas recientes.", modalDetail: (p) => `${awardStats(p).assists || 0} asistencias: impacto directo en las jugadas del equipo.` },
      { label: "Racha imparable", symbol: "↑", unit: "victorias", value: (p) => awardStats(p).longestWinStreak || 0, detail: () => "Mayor cadena de victorias recientes.", modalDetail: (p) => `Su mejor racha fue de ${awardStats(p).longestWinStreak || 0} victorias seguidas.` },
      { label: "El que más sufrió", symbol: "↓", unit: "derrotas", value: (p) => awardStats(p).longestLossStreak || 0, detail: () => "Mayor racha de derrotas; la remontada empieza aquí.", modalDetail: (p) => `La racha más difícil fue de ${awardStats(p).longestLossStreak || 0} derrotas seguidas.` },
      { label: "Champion pool dorado", symbol: "◇", unit: "campeones", value: (p) => (awardStats(p).goodWinrateChampions || []).length, detail: (p) => `${(awardStats(p).goodWinrateChampions || []).map((c) => c.name).join(", ") || "Aún sin dos partidas por campeón."}`, modalDetail: (p) => `Campeones con buen win rate: ${(awardStats(p).goodWinrateChampions || []).map((c) => c.name).join(", ") || "sin registros suficientes"}.` },
      { label: "Mejor OTP", symbol: "◆", unit: "partidas", value: (p) => champion(p)?.games || 0, score: otpScore, detail: (p) => { const c = champion(p); return c ? `${c.name} · ${c.games} partidas · ${c.winRate}% WR` : "Aún sin campeón recurrente."; }, modalDetail: (p) => { const c = champion(p); return c ? `${c.name}: ${c.games} partidas y ${c.winRate}% de win rate.` : "Sin datos suficientes."; } },
    ];

    [
      makeRoleAward("Mejor Top", "⬆", "TOP"),
      makeRoleAward("Mejor Jungla", "✦", "JUNGLE"),
      makeRoleAward("Mejor Mid", "◆", "MIDDLE"),
      makeRoleAward("Mejor ADC", "➤", "BOTTOM"),
      makeRoleAward("Mejor Support", "✚", "UTILITY"),
    ].filter((award) => playersWithStats.some((player) => award.score(player) >= 0)).forEach((award) => awards.push(award));

    awardsGrid.innerHTML = "";
    awards.forEach((award) => {
      const ranking = [...playersWithStats].sort((a, b) => (award.score ? award.score(b) : award.value(b)) - (award.score ? award.score(a) : award.value(a)));
      const winner = ranking[0];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "award-card";
      card.dataset.symbol = award.symbol;
      card.innerHTML = `<span class="award-emblem">${award.symbol}</span><img class="award-player-icon" src="${winner.profileIconUrl}" alt="" loading="lazy" /><span class="award-content"><span class="award-label">${award.label}</span><span class="award-player">${winner.label || winner.gameName}</span><span class="award-tag">#${winner.tagLine}</span><span class="award-detail">${award.detail(winner)}</span></span><span class="award-value">${award.value(winner)}<small>${award.unit}</small></span>`;
      card.addEventListener("click", () => openAwardModal({ ...award, winner }, ranking));
      awardsGrid.appendChild(card);
    });
    renderPlayAwards();
  }

  function renderPlayAwards() {
    if (!currentPlays.length) return;
    const playAwards = [
      { label: "Mejor jugada", symbol: "♥", unit: "corazones", field: "hearts", detail: "La play más votada por el equipo." },
      { label: "Jugada más graciosa", symbol: "😂", unit: "risas", field: "laughs", detail: "La play que más hizo reír al equipo." },
    ];
    playAwards.forEach((award) => {
      const winner = [...currentPlays].sort((a, b) => Number(b[award.field] || (award.field === "hearts" ? b.votes : 0)) - Number(a[award.field] || (award.field === "hearts" ? a.votes : 0)))[0];
      if (!winner) return;
      const player = playerForPlay(winner);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "award-card award-card--play";
      card.dataset.symbol = award.symbol;
      card.innerHTML = `<span class="award-emblem">${award.symbol}</span><img class="award-player-icon" src="${escapeHtml(getPlayThumbnail(winner))}" alt="" loading="lazy" /><span class="award-content"><span class="award-label">${award.label}</span><span class="award-player">${escapeHtml(winner.title)}</span><span class="award-tag">${escapeHtml(player?.label || winner.player_name)}</span><span class="award-detail">${award.detail}</span></span><span class="award-value">${winner[award.field] || (award.field === "hearts" ? winner.votes || 0 : 0)}<small>${award.unit}</small></span>`;
      card.addEventListener("click", () => document.getElementById("plays-section").scrollIntoView({ behavior: "smooth", block: "start" }));
      awardsGrid.appendChild(card);
    });
  }

  function openAwardModal(award, ranking) {
    const winner = award.winner;
    modalTitle.textContent = award.label;
    modalSubtitle.textContent = "Resultado de la vista previa";
    modalOpgg.href = winner.opggUrl;
    modalOpgg.textContent = "Perfil del ganador";

    const podium = ranking.map((player, index) => `
      <button class="award-podium-row ${index < 3 ? `award-place-${index + 1}` : ""}" type="button">
        <span class="award-place">${index + 1}</span>
        <img src="${player.profileIconUrl}" alt="" loading="lazy" />
        <span class="award-podium-player"><strong>${player.label || player.gameName}</strong><span>#${player.tagLine}</span></span>
        <span class="award-podium-value">${award.value(player)} <small>${award.unit}</small></span>
      </button>
    `).join("");

    modalBody.innerHTML = `
      <section class="award-modal-hero" data-symbol="${award.symbol}">
        <span class="award-modal-symbol">${award.symbol}</span>
        <img src="${winner.profileIconUrl}" alt="" />
        <div><span class="section-kicker">Ganador actual</span><strong>${winner.label || winner.gameName}</strong><p>${award.modalDetail(winner)}</p></div>
        <div class="award-modal-score"><strong>${award.value(winner)}</strong><span>${award.unit}</span></div>
      </section>
      <section class="modal-section award-podium-section">
        <div class="modal-section-title"><span>Podio del reto</span><small>Posición por ${award.label.toLowerCase()}</small></div>
        <div class="award-podium-list">${podium}</div>
      </section>
    `;
    modalBody.querySelectorAll(".award-podium-row").forEach((row, index) => row.addEventListener("click", () => openPlayerModal(ranking[index])));
    modal.hidden = false;
  }
  function switchView(viewName) {
    const awardsActive = viewName === "awards";
    leaderboardView.hidden = awardsActive;
    awardsView.hidden = !awardsActive;

    if (!awardsActive) {
      currentBoardMode = viewName;
      const isProgress = viewName === "progress";
      boardKicker.textContent = isProgress ? "Carrera personal" : "Escalera competitiva";
      boardTitle.textContent = isProgress ? "Progreso del reto" : "Ranking actual";
      boardDescription.textContent = isProgress
        ? "Ordenado por cercanía actual hacia la meta personal."
        : "Ordenado por rango y LP actuales; no representa el progreso del reto.";
      renderBoard();
    }

    viewTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewName));
  }

  // Arma las dos columnas de campeones de la partida en curso (estilo
  // op.gg): equipo 100 (azul) a la izquierda, equipo 200 (rojo) a la
  // derecha, resaltando el campeón del jugador del reto dentro de su equipo.
  function renderLiveGameTeam(participants, teamId) {
    return participants
      .filter((participant) => participant.teamId === teamId)
      .map((participant) => `
        <span class="live-champ${participant.isPlayer ? " live-champ--you" : ""}" title="${escapeHtml(participant.championName)}">
          ${participant.championIconUrl ? `<img src="${escapeHtml(participant.championIconUrl)}" alt="${escapeHtml(participant.championName)}" loading="lazy" />` : ""}
        </span>
      `).join("");
  }

  function getLiveGameMarkup(player) {
    const activeGame = player.activeGame;
    if (!activeGame || !activeGame.participants || !activeGame.participants.length) return "";

    const blueTeam = renderLiveGameTeam(activeGame.participants, 100);
    const redTeam = renderLiveGameTeam(activeGame.participants, 200);

    return `
      <section class="modal-section live-game-section">
        <div class="modal-section-title">
          <span>Partida en curso</span>
          <small>${escapeHtml(activeGame.queue)} · ${formatMatchDuration(activeGame.seconds)}</small>
        </div>
        <div class="live-game-teams">
          <div class="live-game-team live-game-team--blue">${blueTeam}</div>
          <span class="live-game-vs">VS</span>
          <div class="live-game-team live-game-team--red">${redTeam}</div>
        </div>
      </section>
    `;
  }

  function openPlayerModal(player) {
    if (!player) return;
    modalTitle.textContent = player.gameName;
    modalSubtitle.textContent = `${player.label || "Jugador"} · Ficha competitiva del reto${player.activeGame ? ` · En partida (${player.activeGame.queue})` : ""}`;
    modalOpgg.href = player.opggUrl;
    modalOpgg.textContent = "Abrir LeagueOfGraphs";

    const stats = player.stats || {};
    const championEntries = (stats.championEntries || []).slice(0, 4);
    const championMarkup = championEntries.length
      ? championEntries.map((entry) => `
          <div class="champion-item">
            <img class="champion-icon" src="${getChampionIconUrl(player, entry.name)}" alt="${entry.name}" loading="lazy" />
            <div class="champion-copy">
              <strong>${entry.name}</strong>
              <span>${entry.games} partidas · ${entry.winRate}% WR</span>
            </div>
            <span class="champion-record">${entry.wins}V · ${entry.losses}D</span>
          </div>
        `).join("")
      : '<div class="champion-item"><strong>Sin datos recientes</strong></div>';

    const recentMatches = (stats.recentMatches || []).slice(0, 4);
    const matchMarkup = recentMatches.length
      ? recentMatches.map((match) => {
          const kdaRatio = ((match.kills + match.assists) / Math.max(1, match.deaths)).toFixed(2);
          const items = (match.items || []).slice(0, 6).map((itemId) => `<img src="${getItemIconUrl(player, itemId)}" alt="Objeto" loading="lazy" />`).join("");
          return `
            <article class="match-card match-card--opgg ${match.win ? "match-win" : "match-loss"}">
              <span class="match-result">${match.win ? "V" : "D"}</span>
              <img class="match-champion-icon" src="${match.championIconUrl}" alt="${match.champion}" loading="lazy" />
              <div class="match-champion"><strong>${match.champion}</strong><span>${match.queue || "Clasificatoria"} · ${formatMatchDuration(match.duration)}</span></div>
              <div class="match-kda"><strong>${match.kills} / ${match.deaths} / ${match.assists}</strong><span>${kdaRatio}:1 KDA</span></div>
              <div class="match-cs"><strong>${match.cs ?? "—"}</strong><span>CS</span></div>
              <div class="match-items">${items || '<span class="match-no-items">Sin objetos</span>'}</div>
            </article>`;
        }).join("")
      : '<div class="empty-history">Aún no hay partidas recientes para mostrar.</div>';
    const rankLabel = player.ranked
      ? `${TIER_LABELS[player.ranked.tier] || player.ranked.tier}${APEX.has(player.ranked.tier) ? "" : ` ${player.ranked.rank}`} · ${player.ranked.leaguePoints} LP`
      : "Sin clasificación";
    const goalLabel = player.goalTier ? (TIER_LABELS[player.goalTier] || player.goalTier) : "Meta pendiente";
    const hasRecentActivity = stats.matchesPlayed > 0;
    const liveGameMarkup = getLiveGameMarkup(player);
    const activityMarkup = hasRecentActivity
      ? `
        <section class="modal-section">
          <div class="modal-section-title"><span>Rendimiento del reto</span><small>${stats.matchesPlayed} partidas registradas</small></div>
          <div class="modal-grid">
            <div class="modal-stat"><div class="label">Partidas</div><div class="value">${stats.matchesPlayed}</div></div>
            <div class="modal-stat"><div class="label">Victorias</div><div class="value">${stats.wins}</div></div>
            <div class="modal-stat"><div class="label">Pentakills</div><div class="value">${stats.pentakills}</div></div>
            <div class="modal-stat"><div class="label">Mejor racha</div><div class="value">${stats.longestWinStreak || 0}V</div></div>
          </div>
        </section>
        <section class="modal-section">
          <div class="modal-section-title"><span>Últimas 4 partidas</span><small>Campeón · KDA · CS · objetos</small></div>
          <div class="match-history">${matchMarkup}</div>
        </section>
        <section class="modal-section">
          <div class="modal-section-title"><span>Campeones más jugados</span><small>Resumen por campeón</small></div>
          <div class="champion-list">${championMarkup}</div>
        </section>`
      : `<section class="modal-empty-state">
          <span class="modal-empty-icon">⌁</span>
          <div><strong>Actividad reciente en preparación</strong><p>Los resultados de partidas aparecerán aquí cuando Riot complete la actualización. Tu rango y meta siguen disponibles arriba.</p></div>
        </section>`;

    modalBody.innerHTML = `
      <section class="modal-player-hero">
        <img class="modal-profile-icon" src="${player.profileIconUrl}" alt="" />
        <div class="modal-rank-summary">
          <span class="section-kicker">Perfil competitivo</span>
          <strong>${rankLabel}</strong>
          <span>#${player.tagLine} · ${player.summonerLevel} nivel</span>
        </div>
        <div class="modal-goal">
          <span>Meta</span>
          ${player.goalTier ? `<img src="${getTierIconPath(player.goalTier)}" alt="Meta: ${goalLabel}" />` : ""}
          <strong>${goalLabel}</strong>
        </div>
      </section>
      ${liveGameMarkup}
      ${activityMarkup}
    `;
    modal.hidden = false;
  }

  function closePlayerModal() {
    modal.hidden = true;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      if (!nextUpdateAt) return;
      const remaining = nextUpdateAt - Date.now();
      if (remaining <= 0) {
        countdownEl.textContent = "actualizando…";
        return;
      }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      countdownEl.textContent = `${m}m ${s.toString().padStart(2, "0")}s`;
    }, 1000);
  }

  async function load() {
    statusDot.className = "status-dot";
    statusText.textContent = "Cargando datos…";
    errorBox.hidden = true;

    try {
      const res = await fetch(CFG.BACKEND_URL);
      if (!res.ok) throw new Error(`El backend respondió ${res.status}`);
      const data = await res.json();

      render(data.players);
      updatedAtEl.textContent = formatTime(data.updatedAt);
      nextUpdateAt = data.nextUpdateAt || Date.now() + CFG.REFRESH_MS;
      startCountdown();

      statusDot.className = "status-dot live";
      statusText.textContent = data.stale
        ? "Mostrando último dato disponible"
        : "En vivo";

      if (data.warning) {
        errorBox.hidden = false;
        errorBox.textContent = data.warning;
      }
    } catch (err) {
      statusDot.className = "status-dot error";
      statusText.textContent = "No se pudo cargar";
      errorBox.hidden = false;
      errorBox.textContent =
        "No se pudo conectar con el backend. Revisa que el servicio de Render esté activo. Detalle: " +
        err.message;
    }
  }
  async function refreshActiveGames() {
    if (!currentPlayers.length) return;
    try {
      const res = await fetch("/api/active-games");
      if (!res.ok) return;
      const data = await res.json();
      const statuses = new Map(data.players.map((player) => [`${player.gameName}#${player.tagLine}`, player.activeGame]));
      currentPlayers = currentPlayers.map((player) => ({
        ...player,
        activeGame: statuses.get(`${player.gameName}#${player.tagLine}`) || null,
      }));
      renderBoard();
    } catch (_) {
      // El estado de partida es informativo: no interrumpe la tabla principal.
    }
  }
  viewTabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  modalClose.addEventListener("click", closePlayerModal);
  modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]")) closePlayerModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closePlayerModal();
    if (event.key === "Escape" && !playUploadModal.hidden) closePlayUpload();
  });

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  }

  function getVoterId() {
    const key = "oflpm_play_voter";
    let voterId = localStorage.getItem(key);
    if (!voterId) {
      voterId = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9_-]/g, "");
      localStorage.setItem(key, voterId);
    }
    return voterId;
  }

  function populatePlayPlayers(players) {
    if (!playPlayer || playPlayer.options.length > 1) return;
    players.forEach((player) => {
      const option = document.createElement("option");
      option.value = `${player.gameName}#${player.tagLine}`;
      option.textContent = player.label || `${player.gameName}#${player.tagLine}`;
      playPlayer.appendChild(option);
    });
  }

  function getPlayThumbnail(play) {
    if (play.thumbnail_url) return play.thumbnail_url;
    const cloudName = (play.video_url || "").match(/res\.cloudinary\.com\/([^/]+)/)?.[1];
    return cloudName && play.public_id ? `https://res.cloudinary.com/${cloudName}/video/upload/so_0,w_960,c_fill/${play.public_id}.jpg` : "";
  }

  function playerForPlay(play) {
    return currentPlayers.find((player) => `${player.gameName}#${player.tagLine}` === play.player_key);
  }

  function renderPlays(plays) {
    if (!playsFeatured || !playsCarousel) return;
    if (!plays.length) {
      playsFeatured.className = "plays-featured plays-empty";
      playsFeatured.innerHTML = '<div><span class="section-kicker">Aún no hay clips</span><strong>La primera play legendaria está por llegar.</strong><p>Sube un MP4 y quedará aquí para que el equipo la vote.</p></div>';
      playsCarousel.innerHTML = "";
      return;
    }
    const renderFeatured = (play) => {
      const featuredPlayer = playerForPlay(play);
      const featuredAvatar = featuredPlayer?.profileIconUrl || "";
      playsFeatured.className = "plays-featured";
      playsFeatured.innerHTML = `<video class="featured-video" controls preload="metadata" poster="${escapeHtml(getPlayThumbnail(play))}"><source src="${escapeHtml(play.video_url)}" type="video/mp4" /></video><div class="featured-copy"><span class="featured-label">Mejor jugada actual</span><h3>${escapeHtml(play.title)}</h3><p>${escapeHtml(play.description || "Jugadón enviado por el equipo.")}</p><div class="featured-player">${featuredAvatar ? `<img src="${escapeHtml(featuredAvatar)}" alt="" />` : ""}<span>${escapeHtml(play.player_name)}</span><strong>♥ ${play.hearts ?? play.votes ?? 0} · 😂 ${play.laughs || 0}</strong></div></div>`;
    };
    renderFeatured(plays[0]);
    playsCarousel.innerHTML = plays.map((play) => `<article class="play-card"><button class="play-card-media" type="button" data-play-id="${play.id}"><img src="${escapeHtml(getPlayThumbnail(play))}" alt="${escapeHtml(play.title)}" loading="lazy" /><span>▶</span></button><div class="play-card-copy"><strong>${escapeHtml(play.title)}</strong><span>${escapeHtml(play.player_name)}</span><div class="play-reactions"><button class="play-vote" type="button" data-play-react="heart" data-play-id="${play.id}" aria-label="Mejor jugada">♥ <b>${play.hearts ?? play.votes ?? 0}</b></button><button class="play-vote play-laugh" type="button" data-play-react="laugh" data-play-id="${play.id}" aria-label="Jugada más graciosa">😂 <b>${play.laughs || 0}</b></button></div></div></article>`).join("");
    playsCarousel.querySelectorAll("[data-play-react]").forEach((button) => button.addEventListener("click", () => reactToPlay(button.dataset.playId, button.dataset.playReact)));
    playsCarousel.querySelectorAll(".play-card-media").forEach((button) => button.addEventListener("click", () => { const play = plays.find((item) => item.id === button.dataset.playId); if (play) { renderFeatured(play); playsFeatured.scrollIntoView({ behavior: "smooth", block: "center" }); document.querySelector(".featured-video")?.play().catch(() => {}); } }));
  }
  async function loadPlays() {
    try {
      const response = await fetch("/api/plays");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar las jugadas.");
      currentPlays = data.plays || [];
      renderPlays(currentPlays);
      if (currentPlayers.length) renderAwards(currentPlayers);
    } catch (error) {
      playsFeatured.className = "plays-featured plays-empty";
      playsFeatured.innerHTML = `<div><strong>No se pudieron cargar las plays.</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  async function reactToPlay(playId, reaction) {
    try {
      const response = await fetch(`/api/plays/${playId}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voterId: getVoterId(), reaction }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No fue posible registrar la reacción.");
      loadPlays();
    } catch (error) { window.alert(error.message); }
  }

  function openPlayUpload() {
    playUploadStatus.textContent = "";
    playUploadModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closePlayUpload() {
    playUploadModal.hidden = true;
    document.body.classList.remove("modal-open");
  }
  async function uploadPlay(event) {
    event.preventDefault();
    const file = playFile.files[0];
    const playerKey = playPlayer.value;
    const title = document.getElementById("play-title").value.trim();
    const description = document.getElementById("play-description").value.trim();
    if (!file || !playerKey || !title) return;
    if (file.type !== "video/mp4" || file.size > 100 * 1024 * 1024) { playUploadStatus.textContent = "Usa un MP4 de máximo 100 MB."; return; }
    const submit = playUploadForm.querySelector("button[type=submit]");
    submit.disabled = true;
    playUploadStatus.textContent = "Preparando subida segura…";
    try {
      const signatureResponse = await fetch("/api/plays/signature", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerKey }) });
      const signatureData = await signatureResponse.json();
      if (!signatureResponse.ok) throw new Error(signatureData.error || "No se pudo preparar la subida.");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", signatureData.apiKey);
      formData.append("timestamp", signatureData.timestamp);
      formData.append("signature", signatureData.signature);
      formData.append("folder", signatureData.folder);
      playUploadStatus.textContent = "Subiendo vídeo a Cloudinary…";
      const cloudResponse = await fetch(`https://api.cloudinary.com/v1_1/${signatureData.cloudName}/video/upload`, { method: "POST", body: formData });
      const cloudData = await cloudResponse.json();
      if (!cloudResponse.ok) throw new Error(cloudData.error?.message || "Cloudinary rechazó el vídeo.");
      playUploadStatus.textContent = "Publicando la play…";
      const thumbnailUrl = `https://res.cloudinary.com/${signatureData.cloudName}/video/upload/so_0,w_960,c_fill/${cloudData.public_id}.jpg`;
      const saveResponse = await fetch("/api/plays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerKey, title, description, publicId: cloudData.public_id, videoUrl: cloudData.secure_url, thumbnailUrl }) });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saved.error || "El vídeo subió, pero no se pudo publicar.");
      playUploadForm.reset();
      playFileName.textContent = "Selecciona un archivo";
      playUploadStatus.textContent = "Play publicada. ¡Que empiecen los votos!";
      loadPlays();
      setTimeout(closePlayUpload, 650);
    } catch (error) { playUploadStatus.textContent = error.message; }
    finally { submit.disabled = false; }
  }
  playsUploadToggle.addEventListener("click", openPlayUpload);
  playUploadClose.addEventListener("click", closePlayUpload);
  playUploadModal.addEventListener("click", (event) => { if (event.target.matches("[data-close-play-upload]")) closePlayUpload(); });
  playFile.addEventListener("change", () => { playFileName.textContent = playFile.files[0]?.name || "Selecciona un archivo"; });
  playUploadForm.addEventListener("submit", uploadPlay);
  playsPrev.addEventListener("click", () => playsCarousel.scrollBy({ left: -360, behavior: "smooth" }));
  playsNext.addEventListener("click", () => playsCarousel.scrollBy({ left: 360, behavior: "smooth" }));

  load();
  loadPlays();
  setInterval(() => load(), CFG.REFRESH_MS);
  setInterval(refreshActiveGames, CFG.ACTIVE_GAMES_REFRESH_MS);
})();