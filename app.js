(function () {
  'use strict';

  // Team sizes per official rules (avalon.fun/pdfs/rules.pdf) – Team Building Phase chart.
  // Rows = 1st–5th Quest, cols = 5–10 players. Leader assigns this many Team Tokens.
  const QUEST_TEAM_SIZES = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5],
  };

  const STORAGE_KEY = 'avalon-assistant-state';

  let state = {
    players: [],
    playerCount: 5,
    currentMission: 1,       // 1–5
    successCount: 0,
    failCount: 0,
    leaderIndex: 0,
    rejectionCountThisRound: 0,
    proposedTeam: null,      // array of player names when voting
    currentProposer: null,   // who proposed the current team (set when they click Propose)
    history: [],             // { mission, teamSize, proposedTeam, approvedBy, rejectedBy, result: 'success'|'fail'|null }
    voteRounds: [],          // rejected proposals this round: { proposedTeam, approvedBy, rejectedBy }
  };

  const $ = (id) => document.getElementById(id);

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = { ...state, ...parsed };
        return true;
      }
    } catch (_) {}
    return false;
  }

  function getRequiredTeamSize() {
    const sizes = QUEST_TEAM_SIZES[state.playerCount];
    return sizes ? sizes[state.currentMission - 1] : 2;
  }

  function getTeamSizesText(playerCount) {
    const sizes = QUEST_TEAM_SIZES[playerCount];
    if (!sizes) return '';
    const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
    return sizes.map((s, i) => ordinals[i] + '=' + s).join(', ');
  }

  function renderMissionSizeHint() {
    const n = parseInt($('player-count').value, 10);
    const text = getTeamSizesText(n);
    if (!text) return;
    $('mission-size-hint').textContent =
      'Team size per Quest: ' + text + ' (changes with number of players).';
  }

  /** Game view: player list with current leader highlighted. */
  function renderPlayerList(containerId, players, leaderIndex, showLeaderLabel) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = '';
    const n = players.length;
    if (n === 0) return;
    for (let i = 0; i < n; i++) {
      const isLeader = leaderIndex >= 0 && i === leaderIndex;
      const row = document.createElement('div');
      row.className = 'player-list-row' + (isLeader ? ' player-list-row--leader' : '');
      const num = document.createElement('span');
      num.className = 'player-list-seat-num';
      num.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'player-list-name';
      name.textContent = players[i];
      row.appendChild(num);
      row.appendChild(name);
      if (isLeader && showLeaderLabel) {
        const badge = document.createElement('span');
        badge.className = 'player-list-badge';
        badge.textContent = 'Leader';
        row.appendChild(badge);
      }
      container.appendChild(row);
    }
  }

  /** Setup: one row per seat with name input. Order = seating / leader rotation. */
  function renderSetupRoundTableInputs() {
    const count = parseInt($('player-count').value, 10);
    const container = $('setup-round-table');
    if (!container || count < 1) return;
    const existing = getSetupRoundTableNames();
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'player-list-row player-list-row--editable';
      const numSpan = document.createElement('span');
      numSpan.className = 'player-list-seat-num';
      numSpan.textContent = 'Seat ' + (i + 1);
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'player-list-input';
      input.placeholder = 'Name';
      input.setAttribute('data-seat', String(i));
      input.autocomplete = 'off';
      if (existing[i] !== undefined && existing[i] !== '') input.value = existing[i];
      row.appendChild(numSpan);
      row.appendChild(input);
      container.appendChild(row);
    }
    populateFirstLeaderSelect();
  }

  function populateFirstLeaderSelect() {
    const sel = $('first-leader-select');
    if (!sel) return;
    const names = getSetupRoundTableNames();
    const previous = sel.value;
    sel.innerHTML = '';
    names.forEach((name, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = name ? (name + ' (Seat ' + (i + 1) + ')') : ('Seat ' + (i + 1) + ' — enter name');
      if (!name) opt.disabled = true;
      sel.appendChild(opt);
    });
    if (previous !== '' && names[parseInt(previous, 10)]) sel.value = previous;
  }

  function getSetupRoundTableNames() {
    const container = $('setup-round-table');
    if (!container) return [];
    const inputs = container.querySelectorAll('input.player-list-input');
    return Array.from(inputs).map((inp) => inp.value.trim());
  }

  function updateSetupRoundTable() {
    renderSetupRoundTableInputs();
  }

  function startGame() {
    const count = parseInt($('player-count').value, 10);
    const names = getSetupRoundTableNames();

    if (names.length !== count) {
      alert('Please set number of players to match the number of seats in the list.');
      return;
    }
    const empty = names.findIndex((n) => !n);
    if (empty !== -1) {
      alert('Please enter a name for every seat (Seat ' + (empty + 1) + ' is empty).');
      return;
    }

    let leaderIndex = parseInt($('first-leader-select').value, 10);
    if (isNaN(leaderIndex) || leaderIndex < 0 || leaderIndex >= names.length) leaderIndex = 0;

    state = {
      players: names,
      playerCount: count,
      currentMission: 1,
      successCount: 0,
      failCount: 0,
      leaderIndex: leaderIndex,
      rejectionCountThisRound: 0,
      proposedTeam: null,
      currentProposer: null,
      history: [],
      voteRounds: [],
    };
    saveState();
    showGameSection();
    renderGame();
  }

  function resetGame() {
    state = {
      players: [],
      playerCount: 5,
      currentMission: 1,
      successCount: 0,
      failCount: 0,
      leaderIndex: 0,
      rejectionCountThisRound: 0,
      proposedTeam: null,
      currentProposer: null,
      history: [],
      voteRounds: [],
    };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    $('player-count').value = '5';
    $('setup-section').hidden = false;
    $('game-section').hidden = true;
    renderMissionSizeHint();
    updateSetupRoundTable();
  }

  function showGameSection() {
    $('setup-section').hidden = true;
    $('game-section').hidden = false;
  }

  function getLeaderName() {
    return state.players[state.leaderIndex] || '—';
  }

  function renderGame() {
    const teamSize = getRequiredTeamSize();
    const sizesText = getTeamSizesText(state.playerCount);

    $('current-mission-num').textContent = state.currentMission;
    $('required-team-size').textContent = teamSize;
    $('game-team-sizes-hint').textContent = sizesText ? 'All Quests: ' + sizesText : '';
    $('success-count').textContent = state.successCount;
    $('fail-count').textContent = state.failCount;
    $('rejection-count').textContent = state.rejectionCountThisRound;
    $('current-leader').textContent = getLeaderName();
    $('current-proposer').textContent = getLeaderName();
    $('team-size-reminder').textContent = teamSize;
    const fifthProposeNote = $('propose-team-fifth-note');
    if (fifthProposeNote) fifthProposeNote.hidden = state.rejectionCountThisRound !== 4;

    renderPlayerList('game-round-table', state.players, state.leaderIndex, true);
    renderTeamCheckboxes(teamSize);
    renderVotePanel();
    renderMissionResultPanel();
    renderVoteRounds();
    renderHistory();
    renderVoteRoundsNote();
  }

  function renderTeamCheckboxes(requiredSize) {
    const container = $('team-checkboxes');
    container.innerHTML = '';
    state.players.forEach((name) => {
      const id = 'team-' + name.replace(/\s/g, '-');
      const label = document.createElement('label');
      label.innerHTML =
        '<input type="checkbox" name="team-member" value="' + escapeHtml(name) + '" /> ' + escapeHtml(name);
      label.querySelector('input').id = id;
      container.appendChild(label);
    });
  }

  function getSelectedTeam() {
    const checkboxes = document.querySelectorAll('input[name="team-member"]:checked');
    return Array.from(checkboxes).map((el) => el.value);
  }

  // After 4 rejected proposals in a row, the 5th proposal is approved without a vote (official rule).
  function proposeTeam() {
    const required = getRequiredTeamSize();
    const selected = getSelectedTeam();
    if (selected.length !== required) {
      alert('Please assign exactly ' + required + ' Team Tokens for this Quest (see team size above).');
      return;
    }
    state.proposedTeam = selected;
    state.currentProposer = getLeaderName();
    const proposer = state.currentProposer;

    if (state.rejectionCountThisRound >= 4) {
      // 5th proposal: no vote — team goes straight to quest phase
      state.voteRounds.push({
        proposedBy: proposer,
        proposedTeam: state.proposedTeam.slice(),
        approvedBy: [],
        rejectedBy: [],
        result: 'approved',
        forcedApproval: true,
      });
      state.proposedTeam = null;
      state.currentProposer = null;
      state.rejectionCountThisRound = 0;
      saveState();
      $('vote-panel').classList.add('hidden');
      showMissionResultPanel();
      renderGame();
      $('mission-result-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    saveState();
    renderGame();
    $('vote-panel').classList.remove('hidden');
    $('mission-result-panel').classList.add('hidden');
  }

  function cancelProposal() {
    state.proposedTeam = null;
    state.currentProposer = null;
    saveState();
    renderGame();
    $('vote-panel').classList.add('hidden');
  }

  function renderVotePanel() {
    const panel = $('vote-panel');
    const summary = $('proposed-team-summary');
    const inputs = $('vote-inputs');
    if (!state.proposedTeam || state.proposedTeam.length === 0) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    $('proposed-by-summary').textContent = 'Leader (proposed this Team): ' + (state.currentProposer || getLeaderName());
    summary.textContent = 'Team: ' + state.proposedTeam.join(', ');
    inputs.innerHTML = '';
    state.players.forEach((name) => {
      const row = document.createElement('div');
      row.className = 'vote-row';
      row.setAttribute('data-voter', name);
      row.appendChild(document.createElement('span')).className = 'vote-player-name';
      row.querySelector('.vote-player-name').textContent = name;
      const btnApprove = document.createElement('button');
      btnApprove.type = 'button';
      btnApprove.className = 'btn-vote btn-vote-approve';
      btnApprove.textContent = 'Approve';
      btnApprove.setAttribute('aria-pressed', 'false');
      const btnReject = document.createElement('button');
      btnReject.type = 'button';
      btnReject.className = 'btn-vote btn-vote-reject';
      btnReject.textContent = 'Reject';
      btnReject.setAttribute('aria-pressed', 'false');
      function setVote(v) {
        row.setAttribute('data-vote', v);
        btnApprove.classList.toggle('btn-vote-active', v === 'yes');
        btnReject.classList.toggle('btn-vote-active', v === 'no');
        btnApprove.setAttribute('aria-pressed', v === 'yes' ? 'true' : 'false');
        btnReject.setAttribute('aria-pressed', v === 'no' ? 'true' : 'false');
      }
      btnApprove.addEventListener('click', function () { setVote('yes'); });
      btnReject.addEventListener('click', function () { setVote('no'); });
      row.appendChild(btnApprove);
      row.appendChild(btnReject);
      inputs.appendChild(row);
    });
  }

  function getVotes() {
    const rows = document.querySelectorAll('.vote-row[data-voter]');
    const votes = {};
    rows.forEach((row) => {
      const voter = row.getAttribute('data-voter');
      votes[voter] = row.getAttribute('data-vote') || '';
    });
    return votes;
  }

  function submitVotes() {
    const votes = getVotes();
    const approvedBy = [];
    const rejectedBy = [];
    state.players.forEach((name) => {
      const v = votes[name];
      if (v === 'yes') approvedBy.push(name);
      else if (v === 'no') rejectedBy.push(name);
    });

    const missing = state.players.filter((n) => !votes[n] || votes[n] === '');
    if (missing.length > 0) {
      alert('Please set a vote (Approve or Reject) for every player: ' + missing.join(', '));
      return;
    }

    // Rules: "The Team is approved if the majority accepts. If the Team is rejected (a tied Vote is also rejection)"
    const totalApproved = approvedBy.length;
    const approved = totalApproved > state.players.length / 2;

    const proposer = state.currentProposer || getLeaderName();
    if (approved) {
      state.voteRounds.push({
        proposedBy: proposer,
        proposedTeam: state.proposedTeam.slice(),
        approvedBy: approvedBy.slice(),
        rejectedBy: rejectedBy.slice(),
        result: 'approved',
      });
      state.proposedTeam = null;
      state.currentProposer = null;
      saveState();
      $('vote-panel').classList.add('hidden');
      showMissionResultPanel();
      renderGame();
      $('mission-result-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    state.rejectionCountThisRound++;
    state.voteRounds.push({
      proposedBy: proposer,
      proposedTeam: state.proposedTeam.slice(),
      approvedBy: approvedBy.slice(),
      rejectedBy: rejectedBy.slice(),
      result: 'rejected',
    });
    state.history.push({
      mission: state.currentMission,
      teamSize: getRequiredTeamSize(),
      proposedBy: proposer,
      proposedTeam: state.proposedTeam.slice(),
      approvedBy: approvedBy.slice(),
      rejectedBy: rejectedBy.slice(),
      result: 'rejected',
    });
    state.leaderIndex = (state.leaderIndex + 1) % state.players.length;
    state.proposedTeam = null;
    saveState();

    renderGame();
    $('vote-panel').classList.add('hidden');
  }

  function getMissionTeam() {
    const lastRound = state.voteRounds[state.voteRounds.length - 1];
    return lastRound && lastRound.result === 'approved' ? lastRound.proposedTeam : [];
  }

  function showMissionResultPanel() {
    const panel = $('mission-result-panel');
    const lastRound = state.voteRounds[state.voteRounds.length - 1];
    const team = getMissionTeam();
    const fifthNote = $('mission-forced-approval-note');
    if (fifthNote) {
      fifthNote.hidden = !(lastRound && lastRound.forcedApproval);
    }
    $('mission-proposed-by').textContent = (lastRound && lastRound.proposedBy) ? lastRound.proposedBy : (state.currentProposer || getLeaderName()) || '—';
    $('mission-team-display').textContent = team.join(', ');
    const mission4Rule = $('mission-4-rule');
    mission4Rule.hidden = !(state.currentMission === 4 && state.playerCount >= 7);
    renderMissionCardsInputs(team);
    panel.classList.remove('hidden');
  }

  function renderMissionCardsInputs(team) {
    const container = $('mission-cards-inputs');
    container.innerHTML = '';
    (team || []).forEach((name) => {
      const label = document.createElement('label');
      label.className = 'mission-card-row';
      label.innerHTML =
        '<span class="mission-card-name">' + escapeHtml(name) + '</span> ' +
        '<select data-mission-card="' + escapeHtml(name) + '">' +
        '<option value="">—</option>' +
        '<option value="success">Success</option>' +
        '<option value="fail">Fail</option>' +
        '</select>';
      container.appendChild(label);
    });
  }

  function getMissionCardsPlayed() {
    const team = getMissionTeam();
    const selects = document.querySelectorAll('select[data-mission-card]');
    const played = {};
    selects.forEach((sel) => {
      const name = sel.getAttribute('data-mission-card');
      played[name] = sel.value;
    });
    return { team, played };
  }

  // Rules: "The Quest is completed successfully only if all the cards revealed are Success cards.
  // The Quest fails if one (or more) Fail cards have been played."
  // "The 4th Quest (and only the 4th Quest) in games of 7 or more players requires at least two Quest Fail cards to be a failed Quest."
  function computeMissionResult(team, played) {
    let failCount = 0;
    team.forEach((name) => {
      if (played[name] === 'fail') failCount++;
    });
    if (state.currentMission === 4 && state.playerCount >= 7) {
      return failCount >= 2 ? 'fail' : 'success';
    }
    return failCount >= 1 ? 'fail' : 'success';
  }

  function revealOutcome() {
    const { team, played } = getMissionCardsPlayed();
    const missing = team.filter((name) => !played[name] || played[name] === '');
    if (missing.length > 0) {
      alert('Please select Success or Fail for each team member: ' + missing.join(', '));
      return;
    }
    const result = computeMissionResult(team, played);
    recordMissionResult(result);
  }

  function recordMissionResult(result) {
    const lastRound = state.voteRounds[state.voteRounds.length - 1];
    const team = lastRound ? lastRound.proposedTeam : [];
    const approvedBy = lastRound ? lastRound.approvedBy : [];
    const rejectedBy = lastRound ? lastRound.rejectedBy : [];
    const proposedBy = lastRound && lastRound.proposedBy ? lastRound.proposedBy : getLeaderName();

    const historyRow = {
      mission: state.currentMission,
      teamSize: getRequiredTeamSize(),
      proposedBy,
      proposedTeam: team.slice(),
      approvedBy: approvedBy.slice(),
      rejectedBy: rejectedBy.slice(),
      result,
    };
    if (lastRound && lastRound.forcedApproval) historyRow.forcedApproval = true;
    state.history.push(historyRow);

    if (result === 'success') state.successCount++;
    else state.failCount++;

    state.rejectionCountThisRound = 0;
    state.voteRounds = [];

    if (state.successCount >= 3) {
      alert('Arthur and Goodness prevail: the team of Good has successfully completed three Quests!');
    } else if (state.failCount >= 3) {
      alert('Mordred\'s dark forces triumph: three Quests have ended in failure.');
    } else {
      state.currentMission++;
      state.leaderIndex = (state.leaderIndex + 1) % state.players.length;
      if (state.currentMission > 5) {
        alert('All five Quests completed. Check success/fail count for winner.');
      }
    }

    state.proposedTeam = null;
    state.currentProposer = null;
    saveState();
    $('mission-result-panel').classList.add('hidden');
    renderGame();
  }

  function renderMissionResultPanel() {
    if (!state.proposedTeam && state.voteRounds.length > 0) {
      const last = state.voteRounds[state.voteRounds.length - 1];
      if (last && last.result === 'approved') {
        const team = last.proposedTeam || [];
        $('mission-proposed-by').textContent = last.proposedBy || state.currentProposer || '—';
        $('mission-team-display').textContent = team.join(', ');
        $('mission-4-rule').hidden = !(state.currentMission === 4 && state.playerCount >= 7);
        renderMissionCardsInputs(team);
        $('mission-result-panel').classList.remove('hidden');
        return;
      }
    }
    $('mission-result-panel').classList.add('hidden');
  }

  let editModalContext = null; // { type: 'history'|'voteround', index }

  function recalcMissionCountsFromHistory() {
    state.successCount = state.history.filter(function (r) { return r.result === 'success'; }).length;
    state.failCount = state.history.filter(function (r) { return r.result === 'fail'; }).length;
  }

  function openEditModal() {
    const modal = $('edit-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeEditModal() {
    const modal = $('edit-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    editModalContext = null;
  }

  function buildVoteRowsFromArrays(approvedBy, rejectedBy) {
    const container = $('edit-modal-votes');
    if (!container) return;
    container.innerHTML = '';
    state.players.forEach(function (name) {
      const row = document.createElement('div');
      row.className = 'vote-row';
      row.setAttribute('data-voter', name);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'vote-player-name';
      nameSpan.textContent = name;
      row.appendChild(nameSpan);
      const inApprove = approvedBy && approvedBy.indexOf(name) !== -1;
      const inReject = rejectedBy && rejectedBy.indexOf(name) !== -1;
      const current = inApprove ? 'yes' : inReject ? 'no' : '';
      const btnApprove = document.createElement('button');
      btnApprove.type = 'button';
      btnApprove.className = 'btn-vote btn-vote-approve' + (current === 'yes' ? ' btn-vote-active' : '');
      btnApprove.textContent = 'Approve';
      const btnReject = document.createElement('button');
      btnReject.type = 'button';
      btnReject.className = 'btn-vote btn-vote-reject' + (current === 'no' ? ' btn-vote-active' : '');
      btnReject.textContent = 'Reject';
      function setVote(v) {
        row.setAttribute('data-vote', v);
        btnApprove.classList.toggle('btn-vote-active', v === 'yes');
        btnReject.classList.toggle('btn-vote-active', v === 'no');
      }
      btnApprove.addEventListener('click', function () { setVote('yes'); });
      btnReject.addEventListener('click', function () { setVote('no'); });
      if (current) row.setAttribute('data-vote', current === 'yes' ? 'yes' : 'no');
      row.appendChild(btnApprove);
      row.appendChild(btnReject);
      container.appendChild(row);
    });
  }

  function getVotesFromEditModal() {
    const rows = document.querySelectorAll('#edit-modal-votes .vote-row[data-voter]');
    const votes = {};
    rows.forEach(function (row) {
      votes[row.getAttribute('data-voter')] = row.getAttribute('data-vote') || '';
    });
    return votes;
  }

  function openEditHistory(index) {
    const row = state.history[index];
    if (!row) return;
    editModalContext = { type: 'history', index: index };
    $('edit-modal-title').textContent = 'Edit Quest ' + row.mission + ' entry';
    $('edit-modal-summary').textContent =
      'Proposed by: ' + (row.proposedBy || '—') + ' · Team: ' + (row.proposedTeam || []).join(', ');
    buildVoteRowsFromArrays(row.approvedBy || [], row.rejectedBy || []);
    const resultBlock = $('edit-modal-result-block');
    if (row.result === 'success' || row.result === 'fail') {
      resultBlock.hidden = false;
      const setResultStyle = function (r) {
        $('edit-modal-result-success').classList.toggle('btn-vote-active', r === 'success');
        $('edit-modal-result-fail').classList.toggle('btn-vote-active', r === 'fail');
        resultBlock.setAttribute('data-edit-result', r);
      };
      setResultStyle(row.result);
      $('edit-modal-result-success').onclick = function () { setResultStyle('success'); };
      $('edit-modal-result-fail').onclick = function () { setResultStyle('fail'); };
    } else {
      resultBlock.hidden = true;
      resultBlock.removeAttribute('data-edit-result');
    }
    openEditModal();
  }

  function openEditVoteRound(index) {
    const round = state.voteRounds[index];
    if (!round) return;
    editModalContext = { type: 'voteround', index: index };
    $('edit-modal-title').textContent = 'Edit proposal ' + (index + 1) + ' (this round)';
    $('edit-modal-summary').textContent =
      'Leader: ' + (round.proposedBy || '—') + ' · Team: ' + (round.proposedTeam || []).join(', ');
    buildVoteRowsFromArrays(round.approvedBy || [], round.rejectedBy || []);
    $('edit-modal-result-block').hidden = true;
    openEditModal();
  }

  function saveEditModal() {
    if (!editModalContext) return;
    const votes = getVotesFromEditModal();
    const approvedBy = [];
    const rejectedBy = [];
    state.players.forEach(function (name) {
      const v = votes[name];
      if (v === 'yes') approvedBy.push(name);
      else if (v === 'no') rejectedBy.push(name);
    });
    const missing = state.players.filter(function (n) { return !votes[n] || votes[n] === ''; });
    if (missing.length > 0) {
      alert('Set Approve or Reject for every player: ' + missing.join(', '));
      return;
    }
    if (editModalContext.type === 'history') {
      const row = state.history[editModalContext.index];
      if (!row) return;
      row.approvedBy = approvedBy.slice();
      row.rejectedBy = rejectedBy.slice();
      const resultBlock = $('edit-modal-result-block');
      if (!resultBlock.hidden && resultBlock.getAttribute('data-edit-result')) {
        const newResult = resultBlock.getAttribute('data-edit-result');
        if (newResult === 'success' || newResult === 'fail') row.result = newResult;
      }
      recalcMissionCountsFromHistory();
    } else if (editModalContext.type === 'voteround') {
      const round = state.voteRounds[editModalContext.index];
      if (!round) return;
      round.approvedBy = approvedBy.slice();
      round.rejectedBy = rejectedBy.slice();
    }
    saveState();
    closeEditModal();
    renderGame();
  }

  function renderHistory() {
    const tbody = $('history-body');
    tbody.innerHTML = '';
    state.history.forEach(function (row, index) {
      const tr = document.createElement('tr');
      const resultClass =
        row.result === 'success' ? 'result-success' :
        row.result === 'fail' ? 'result-fail' : 'result-rejected';
      const resultText =
        row.result === 'success' ? 'Success' :
        row.result === 'fail' ? 'Failed' : 'Rejected';
      const approveCell = row.forcedApproval ? '— (no vote)' : escapeHtml(row.approvedBy.join(', ') || '—');
      const rejectCell = row.forcedApproval ? '— (no vote)' : escapeHtml(row.rejectedBy.join(', ') || '—');
      const resultCell = row.forcedApproval && (row.result === 'success' || row.result === 'fail')
        ? resultText + ' · 5th auto'
        : resultText;
      tr.innerHTML =
        '<td>' + row.mission + '</td>' +
        '<td>' + row.teamSize + '</td>' +
        '<td>' + escapeHtml(row.proposedBy || '—') + '</td>' +
        '<td>' + escapeHtml(row.proposedTeam.join(', ')) + '</td>' +
        '<td>' + approveCell + '</td>' +
        '<td>' + rejectCell + '</td>' +
        '<td class="' + resultClass + '">' + resultCell + '</td>';
      const tdEdit = document.createElement('td');
      tdEdit.className = 'col-actions';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-edit';
      btn.textContent = 'Edit';
      (function (idx) {
        btn.addEventListener('click', function () { openEditHistory(idx); });
      })(index);
      tdEdit.appendChild(btn);
      tr.appendChild(tdEdit);
      tbody.appendChild(tr);
    });
    renderPlayerAnalysisTable();
    renderRelationshipMap();
  }

  function renderRelationshipMap() {
    const container = $('relationship-map');
    container.innerHTML = '';
    const players = state.players || [];
    const history = state.history || [];
    if (players.length === 0 || history.length === 0) return;

    players.forEach((player) => {
      const card = document.createElement('div');
      card.className = 'relationship-card';
      const nameEsc = escapeHtml(player);

      // When this player led: who voted for/against their teams
      const whenLed = history.filter((r) => r.proposedBy === player);
      let whenLedHtml = '';
      if (whenLed.length > 0) {
        whenLedHtml = '<div class="relationship-section"><strong>When ' + nameEsc + ' led</strong><ul class="relationship-list">';
        whenLed.forEach((r) => {
          const qLabel = r.result === 'rejected' ? 'Quest ' + r.mission + ' (rej)' : 'Quest ' + r.mission;
          const approve = (r.approvedBy && r.approvedBy.length) ? 'Approve: ' + escapeHtml(r.approvedBy.join(', ')) : '';
          const reject = (r.rejectedBy && r.rejectedBy.length) ? 'Reject: ' + escapeHtml(r.rejectedBy.join(', ')) : '';
          whenLedHtml += '<li>' + qLabel + ' — ' + [approve, reject].filter(Boolean).join('; ') + '</li>';
        });
        whenLedHtml += '</ul></div>';
      }

      // This player voted: whom they approved / rejected (by leader name and quest)
      const approvedWhom = [];
      const rejectedWhom = [];
      history.forEach((r) => {
        if (r.proposedBy === player) return;
        const leader = r.proposedBy || '—';
        const qLabel = r.result === 'rejected' ? 'Q' + r.mission + '(rej)' : 'Q' + r.mission;
        if (r.approvedBy && r.approvedBy.indexOf(player) !== -1) approvedWhom.push(leader + ' (' + qLabel + ')');
        if (r.rejectedBy && r.rejectedBy.indexOf(player) !== -1) rejectedWhom.push(leader + ' (' + qLabel + ')');
      });
      let votedHtml = '<div class="relationship-section"><strong>' + nameEsc + ' voted</strong><ul class="relationship-list">';
      if (approvedWhom.length) votedHtml += '<li class="approved">Approved: ' + escapeHtml(approvedWhom.join(', ')) + '</li>';
      if (rejectedWhom.length) votedHtml += '<li class="rejected">Rejected: ' + escapeHtml(rejectedWhom.join(', ')) + '</li>';
      if (!approvedWhom.length && !rejectedWhom.length) votedHtml += '<li>—</li>';
      votedHtml += '</ul></div>';

      // Missions that included this player (success/failed only)
      const missionsWithPlayer = history.filter(
        (r) => (r.result === 'success' || r.result === 'fail') && r.proposedTeam && r.proposedTeam.indexOf(player) !== -1
      );
      let missionsHtml = '';
      if (missionsWithPlayer.length > 0) {
        const parts = missionsWithPlayer.map((r) => {
          const cls = r.result === 'success' ? 'result-success' : 'result-fail';
          return '<span class="' + cls + '">Q' + r.mission + ' ' + (r.result === 'success' ? 'Success' : 'Failed') + '</span>';
        });
        missionsHtml = '<div class="relationship-section"><strong>Missions with ' + nameEsc + '</strong><p class="relationship-missions">' + parts.join(', ') + '</p></div>';
      } else {
        missionsHtml = '<div class="relationship-section"><strong>Missions with ' + nameEsc + '</strong><p class="relationship-missions note">—</p></div>';
      }

      card.innerHTML = '<h5 class="relationship-player-name">' + nameEsc + '</h5>' + whenLedHtml + votedHtml + missionsHtml;
      container.appendChild(card);
    });
  }

  /** Returns cell label for By Player table: ✓ or ✗, with "(T)" if player was on the team. */
  function getPlayerCellLabel(row, playerName) {
    const approved = row.approvedBy && row.approvedBy.indexOf(playerName) !== -1;
    const rejected = row.rejectedBy && row.rejectedBy.indexOf(playerName) !== -1;
    const onTeam = row.proposedTeam && row.proposedTeam.indexOf(playerName) !== -1;
    const vote = approved ? '✓' : rejected ? '✗' : '';
    if (!vote) return '—';
    return onTeam ? vote + '(T)' : vote;
  }

  function renderPlayerAnalysisTable() {
    const table = $('player-analysis-table');
    const thead = $('player-analysis-head');
    const tbody = $('player-analysis-body');
    const players = state.players || [];
    thead.innerHTML = '';
    tbody.innerHTML = '';
    if (players.length === 0) return;
    let colgroup = table.querySelector('colgroup');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      table.insertBefore(colgroup, table.querySelector('thead'));
    }
    colgroup.innerHTML =
      '<col class="col-quest">' +
      '<col class="col-result">' +
      '<col class="col-leader">' +
      players.map(() => '<col class="col-player">').join('');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th>Quest</th><th>Result</th><th>Leader</th>';
    players.forEach((name) => {
      const th = document.createElement('th');
      th.className = 'player-col';
      th.textContent = name;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.style.minWidth = (4.5 + 5.5 + 4.5 + 4.5 * players.length) + 'rem';
    const history = state.history;
    for (let i = 0; i < history.length; i++) {
      const row = history[i];
      const isFirstInQuestBlock = i === 0 || history[i - 1].mission !== row.mission;
      let questRowspan = 1;
      if (isFirstInQuestBlock) {
        while (i + questRowspan < history.length && history[i + questRowspan].mission === row.mission) {
          questRowspan++;
        }
      }
      const resultClass =
        row.result === 'success' ? 'result-success' :
        row.result === 'fail' ? 'result-fail' : 'result-rejected';
      const resultText =
        row.result === 'success' ? 'Success' :
        row.result === 'fail' ? 'Failed' : 'Rejected';
      const tr = document.createElement('tr');
      if (isFirstInQuestBlock) {
        const questTd = document.createElement('td');
        questTd.textContent = String(row.mission);
        questTd.rowSpan = questRowspan;
        tr.appendChild(questTd);
      }
      const resultTd = document.createElement('td');
      resultTd.className = 'result-cell ' + resultClass;
      resultTd.textContent = resultText;
      tr.appendChild(resultTd);
      const leaderTd = document.createElement('td');
      leaderTd.className = 'leader-cell';
      leaderTd.textContent = row.proposedBy || '—';
      tr.appendChild(leaderTd);
      players.forEach((name) => {
        const td = document.createElement('td');
        td.className = 'player-cell';
        td.textContent = getPlayerCellLabel(row, name);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }

  function renderVoteRounds() {
    const list = $('vote-rounds-list');
    list.innerHTML = '';
    state.voteRounds.forEach(function (round, i) {
      const div = document.createElement('div');
      div.className = 'vote-round-item';
      let outcomeText =
        round.result === 'approved'
          ? '— Approved (select Quest success or failed below)'
          : '— Rejected';
      if (round.forcedApproval) {
        outcomeText = '— Approved without vote (5th proposal after 4 rejections)';
      }
      const proposedBy = round.proposedBy || '—';
      div.innerHTML =
        '<div class="team">Proposal ' + (i + 1) + ': ' + escapeHtml(round.proposedTeam.join(', ')) + '</div>' +
        '<div class="proposed-by">Leader: ' + escapeHtml(proposedBy) + '</div>' +
        '<span class="approved">Approve: ' + escapeHtml(round.approvedBy.join(', ') || '—') + '</span><br />' +
        '<span class="rejected">Reject: ' + escapeHtml(round.rejectedBy.join(', ') || '—') + '</span>' +
        '<div class="outcome">' + outcomeText + '</div>';
      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'btn btn-ghost btn-edit vote-round-edit';
      btnEdit.textContent = 'Edit votes';
      (function (idx) {
        btnEdit.addEventListener('click', function () { openEditVoteRound(idx); });
      })(i);
      div.appendChild(btnEdit);
      list.appendChild(div);
    });
    $('vote-rounds-card').hidden = state.voteRounds.length === 0;
    const outcomeBlock = $('vote-rounds-outcome-block');
    const lastApproved = state.voteRounds.length > 0 && state.voteRounds[state.voteRounds.length - 1].result === 'approved';
    outcomeBlock.hidden = !lastApproved;
  }

  function renderVoteRoundsNote() {
    const note = $('vote-rounds-note');
    const rejected = state.voteRounds.filter((r) => r.result === 'rejected');
    if (rejected.length === 0) {
      note.textContent = '';
      return;
    }
    note.textContent =
      'This round: ' +
      rejected.length +
      ' Team proposal(s) rejected. When a Team is approved and the Quest is completed, it appears in the table above.';
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function bind() {
    function onPlayerCountChange() {
      renderMissionSizeHint();
      // Defer so mobile native select closes first; DOM updates reliably
      setTimeout(function () {
        updateSetupRoundTable();
      }, 0);
    }
    $('player-count').addEventListener('change', onPlayerCountChange);
    // Some mobile browsers only fire change on blur; input fires when value changes
    $('player-count').addEventListener('input', onPlayerCountChange);
    const setupTable = $('setup-round-table');
    if (setupTable) setupTable.addEventListener('input', populateFirstLeaderSelect);
    $('btn-start-game').addEventListener('click', startGame);
    $('btn-reset').addEventListener('click', resetGame);
    $('btn-reset-game').addEventListener('click', resetGame);
    $('btn-propose').addEventListener('click', proposeTeam);
    $('btn-cancel-proposal').addEventListener('click', cancelProposal);
    $('btn-approve-vote').addEventListener('click', submitVotes);
    $('btn-reveal-outcome').addEventListener('click', revealOutcome);
    $('btn-mission-success').addEventListener('click', () => recordMissionResult('success'));
    $('btn-mission-fail').addEventListener('click', () => recordMissionResult('fail'));
    $('btn-mission-success-inline').addEventListener('click', () => recordMissionResult('success'));
    $('btn-mission-fail-inline').addEventListener('click', () => recordMissionResult('fail'));
    $('edit-modal-cancel').addEventListener('click', closeEditModal);
    $('edit-modal-save').addEventListener('click', saveEditModal);
    $('edit-modal-backdrop').addEventListener('click', closeEditModal);
  }

  function init() {
    bind();
    renderMissionSizeHint();
    updateSetupRoundTable();
    if (loadState() && state.players && state.players.length > 0) {
      showGameSection();
      renderGame();
    }
  }

  init();
})();
