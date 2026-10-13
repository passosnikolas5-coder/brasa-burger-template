(() => {
  'use strict';

  let video;
  let els;
  let chapters = [];
  let fallbackDuration = 0;
  let activeChapter = -1;
  let pendingSeek = null;
  let pendingProgress = null;
  let seekLocked = false;
  let scrollFrame = null;
  let videoFrame = null;
  let autoplayTimer = null;
  let autoplayAttempted = false;
  let userInteracted = false;
  let desiredPlaying = false;
  let playGeneration = 0;
  let observer;
  let lastScrollTime = 0;
  let initialised = false;
  let fullscreenControlsEnabled = false;
  let controlsBeforeFullscreen = false;
  let scrollMode = false;
  let sceneSelected = false;
  let suppressScrollUntil = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const duration = () => video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : fallbackDuration;
  const currentTime = () => video && Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const percent = () => {
    const total = duration();
    if (!total) return 0;
    const time = currentTime();
    return video?.ended || total - time < 0.05 ? 100 : clamp(time / total * 100, 0, 100);
  };
  const timeLabel = seconds => {
    const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };
  const inViewport = node => {
    if (!node) return false;
    const bounds = node.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < window.innerHeight && bounds.right > 0 && bounds.left < window.innerWidth;
  };
  const hasOpenDialog = () => Boolean(document.querySelector('dialog[open]'));
  const setStatus = message => {
    if (els?.status && els.status.textContent !== message) els.status.textContent = message;
  };

  function cancelAutoplay() {
    if (autoplayTimer !== null) clearTimeout(autoplayTimer);
    autoplayTimer = null;
  }

  function markInteraction() {
    userInteracted = true;
    cancelAutoplay();
  }

  function cancelFrameUpdate() {
    if (videoFrame !== null && video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(videoFrame);
    videoFrame = null;
  }

  function requestFrameUpdate() {
    if (!video?.requestVideoFrameCallback || videoFrame !== null) return;
    videoFrame = video.requestVideoFrameCallback(() => {
      videoFrame = null;
      updateUI();
      if (!video.paused && !video.ended && document.visibilityState === 'visible') requestFrameUpdate();
    });
  }

  function chapterIndex(time) {
    if (!chapters.length) return -1;
    let index = 0;
    chapters.forEach((chapter, candidate) => {
      if (time + 0.025 >= chapter.start) index = candidate;
    });
    return index;
  }

  function updateChapter(time) {
    const index = chapterIndex(time);
    if (index === activeChapter) return;
    activeChapter = index;
    const chapter = chapters[index];
    if (chapter) {
      if (els.number) els.number.textContent = `${String(index + 1).padStart(2, '0')} / ${String(chapters.length).padStart(2, '0')}`;
      if (els.title) els.title.textContent = chapter.title;
      if (els.description) els.description.textContent = chapter.description;
      if (els.caption) els.caption.textContent = chapter.label;
      if (els.specs) {
        els.specs.replaceChildren(...chapter.specs.map(text => {
          const spec = document.createElement('span');
          spec.textContent = text;
          return spec;
        }));
      }
    }
    els.chapters?.querySelectorAll('[data-chapter]').forEach(button => {
      const selected = Number(button.dataset.chapter) === index;
      button.classList.toggle('is-active', selected);
      if (selected) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    if (els.previous) els.previous.disabled = index <= 0;
    if (els.next) els.next.disabled = index < 0 || index >= chapters.length - 1;
  }

  function keepChapterVisible() {
    const nav = els?.chapters;
    const button = nav?.querySelector('[aria-current="step"]');
    if (!nav || !button || nav.scrollWidth <= nav.clientWidth) return;
    const navBounds = nav.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    if (buttonBounds.left < navBounds.left) nav.scrollLeft += buttonBounds.left - navBounds.left;
    else if (buttonBounds.right > navBounds.right) nav.scrollLeft += buttonBounds.right - navBounds.right;
  }

  function ownsFullscreen() {
    return Boolean(video && (document.fullscreenElement === video || video.webkitDisplayingFullscreen));
  }

  function enableFullscreenControls() {
    if (!video || fullscreenControlsEnabled) return;
    controlsBeforeFullscreen = video.controls;
    fullscreenControlsEnabled = true;
    video.controls = true;
  }

  function restoreFullscreenControls() {
    if (!video || !fullscreenControlsEnabled) return;
    video.controls = controlsBeforeFullscreen;
    fullscreenControlsEnabled = false;
  }

  function updateUI() {
    if (!video || !els) return;
    const playing = !video.paused && !video.ended;
    if (els.playLabel) els.playLabel.textContent = playing ? 'Pausar vídeo' : 'Assistir preparo';
    if (els.play) els.play.setAttribute('aria-pressed', String(playing));
    if (els.progress) {
      els.progress.value = String(Math.round(percent() * 10) / 10);
      els.progress.setAttribute('aria-valuetext', `${timeLabel(currentTime())} de ${timeLabel(duration())}`);
      els.progress.disabled = duration() <= 0;
    }
    if (els.time) els.time.textContent = `${timeLabel(currentTime())} / ${timeLabel(duration())}`;
    const preview = !sceneSelected && video.paused && currentTime() < 0.025;
    els.story?.classList.toggle('is-film-preview', preview);
    if (preview) {
      if (els.number) els.number.textContent = `${chapters.length} etapas`;
      if (els.title) els.title.textContent = 'O preparo por inteiro.';
      if (els.description) els.description.textContent = 'Do primeiro contato com a chapa ao burger montado. Assista às oito etapas reais ou escolha a cena que quer ver de perto.';
      if (els.caption) els.caption.textContent = 'Preparo real, do começo ao fim.';
      if (els.specs && !els.specs.dataset.preview) {
        els.specs.replaceChildren(...['Carne e tempero', 'Queijo e bacon', 'Pão e montagem'].map(text => {
          const spec = document.createElement('span'); spec.textContent = text; return spec;
        }));
        els.specs.dataset.preview = 'true';
      }
      if (els.previous) els.previous.disabled = true;
      if (els.next) els.next.disabled = !chapters.length;
    } else {
      if (els.specs) delete els.specs.dataset.preview;
      updateChapter(currentTime());
    }
    keepChapterVisible();
  }

  function pause(message) {
    if (!video) return;
    const wasPlaying = desiredPlaying || !video.paused;
    desiredPlaying = false;
    playGeneration += 1;
    video.pause();
    cancelFrameUpdate();
    if (message && wasPlaying) setStatus(message);
    updateUI();
  }

  async function play(fromAutoplay = false) {
    if (!video) return;
    if (!fromAutoplay) markInteraction();
    if (hasOpenDialog() || document.visibilityState !== 'visible') return;
    sceneSelected = true;
    if (!fromAutoplay && !scrollMode && !inViewport(video)) video.scrollIntoView({block:'center',behavior:'instant'});
    if (video.ended || (duration() && duration() - currentTime() < 0.05)) requestSeekSeconds(0);
    desiredPlaying = true;
    const generation = ++playGeneration;
    setStatus('Carregando o preparo real…');
    try {
      await video.play();
      if (generation !== playGeneration) {
        if (!desiredPlaying) video.pause();
        return;
      }
      if (!desiredPlaying) {
        video.pause();
        return;
      }
      setStatus('Assistindo ao preparo real.');
      updateUI();
      requestFrameUpdate();
    } catch (error) {
      if (generation !== playGeneration) return;
      desiredPlaying = false;
      updateUI();
      if (error?.name !== 'AbortError') setStatus('Toque para assistir.');
      else setStatus('Vídeo pausado. Toque para assistir.');
    }
  }

  function flushSeek() {
    if (!video || pendingSeek === null || seekLocked || video.seeking || video.readyState < 1) return;
    const total = duration();
    if (!total) return;
    const target = clamp(pendingSeek, 0, Math.max(0, total - 0.04));
    pendingSeek = null;
    if (Math.abs(currentTime() - target) < 0.025) {
      updateUI();
      return;
    }
    seekLocked = true;
    try {
      video.currentTime = target;
      requestFrameUpdate();
    } catch {
      seekLocked = false;
      pendingSeek = target;
      setStatus('Carregando a cena selecionada…');
    }
  }

  function requestSeekSeconds(time) {
    if (!video || !Number.isFinite(time)) return;
    pendingSeek = Math.max(0, time);
    flushSeek();
  }

  function seek(progress, message = 'Cena selecionada. Toque para assistir.') {
    const value = Number(progress);
    if (!Number.isFinite(value)) return;
    sceneSelected = true;
    markInteraction();
    pause();
    pendingProgress = clamp(value, 0, 100);
    if (duration() > 0) {
      requestSeekSeconds(duration() * pendingProgress / 100);
      pendingProgress = null;
    }
    setStatus(message);
  }

  function selectChapter(index) {
    const chapter = chapters[index];
    if (!chapter) return;
    sceneSelected = true;
    markInteraction();
    pause();
    pendingProgress = null;
    requestSeekSeconds(chapter.start + 0.15);
    setStatus(`${chapter.label}: cena selecionada. Toque para assistir.`);
  }

  function renderChapters() {
    if (!els.chapters) return;
    const fragment = document.createDocumentFragment();
    chapters.forEach((chapter, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'process-chapter';
      button.dataset.chapter = String(index);
      button.setAttribute('aria-label', `${index + 1}. ${chapter.label}, a partir de ${timeLabel(chapter.start)}`);
      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      const label = document.createElement('b');
      label.textContent = chapter.label;
      button.append(number, label);
      button.addEventListener('click', () => selectChapter(index));
      fragment.append(button);
    });
    els.chapters.replaceChildren(fragment);
  }

  function canAutoplay() {
    return !autoplayAttempted && !userInteracted && !reducedMotion.matches && !navigator.connection?.saveData
      && video?.readyState >= 2 && document.visibilityState === 'visible' && inViewport(video) && !hasOpenDialog();
  }

  function scheduleAutoplay() {
    if (autoplayTimer !== null || !canAutoplay()) return;
    autoplayTimer = setTimeout(() => {
      autoplayTimer = null;
      if (!canAutoplay()) return;
      autoplayAttempted = true;
      void play(true);
    }, 650);
  }

  function handleScroll() {
    scrollFrame = null;
    if (!video || !els.story) return;
    if (!inViewport(els.story) || !inViewport(video)) pause('Vídeo pausado fora da tela.');
    if (!scrollMode || performance.now() < suppressScrollUntil || hasOpenDialog() || reducedMotion.matches || navigator.connection?.saveData) return;
    const bounds = els.story.getBoundingClientRect();
    const header = document.querySelector('.site-header')?.offsetHeight || 0;
    const scrollable = Math.max(1, els.story.offsetHeight - (window.innerHeight - header));
    const progress = clamp((header - bounds.top) / scrollable, 0, 1);
    pause();
    const total = duration();
    if (total > 0) requestSeekSeconds(progress * total);
    else pendingProgress = progress * 100;
    if (inViewport(els.story)) setStatus('Role para acompanhar o preparo ou toque para assistir.');
  }

  function scheduleScroll() {
    markInteraction();
    lastScrollTime = performance.now();
    if (scrollFrame === null) scrollFrame = requestAnimationFrame(handleScroll);
  }

  function setScrollMode(enabled) {
    if (!els?.story || !video) return;
    markInteraction();
    if (enabled && (reducedMotion.matches || navigator.connection?.saveData)) {
      setStatus('Use play ou os capítulos: a exploração por rolagem está desativada pela sua preferência de movimento ou economia de dados.');
      return;
    }
    const panel = els.story.querySelector('.cooking-sticky');
    const oldPanelTop = panel?.getBoundingClientRect().top || 0;
    const selectedProgress = percent() / 100;
    const header = document.querySelector('.site-header')?.offsetHeight || 0;
    pause();
    suppressScrollUntil = performance.now() + 350;
    scrollMode = Boolean(enabled);
    if (scrollMode) sceneSelected = true;
    els.story.classList.toggle('is-scroll-mode', scrollMode);
    els.scrollMode?.setAttribute('aria-pressed', String(scrollMode));
    if (els.scrollLabel) els.scrollLabel.textContent = scrollMode ? 'Voltar ao cinema' : 'Explorar com rolagem';
    if (els.scrollHelp) els.scrollHelp.textContent = scrollMode ? 'Role para avançar. Volte ao cinema para usar play e ver os detalhes completos.' : 'Use play, capítulos ou a linha do tempo para explorar o preparo.';
    const storyTop = els.story.getBoundingClientRect().top + window.scrollY;
    const range = Math.max(1, els.story.offsetHeight - (window.innerHeight - header));
    const target = scrollMode ? storyTop - header + selectedProgress * range : (panel?.getBoundingClientRect().top || 0) + window.scrollY - Math.max(header, oldPanelTop);
    window.scrollTo({top:Math.max(0,target),behavior:'instant'});
    setStatus(scrollMode ? 'Exploração por rolagem ativada. Role para acompanhar cada etapa.' : 'Modo cinema. A cena selecionada foi mantida.');
    updateUI();
  }

  async function toggleFullscreen() {
    if (!video) return;
    markInteraction();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (video.requestFullscreen) {
        enableFullscreenControls();
        await video.requestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        enableFullscreenControls();
        video.webkitEnterFullscreen();
      }
      else setStatus('A tela cheia não está disponível neste navegador.');
    } catch {
      restoreFullscreenControls();
      setStatus('Seu navegador não permitiu a tela cheia. Continue assistindo aqui.');
    }
  }

  function init() {
    if (initialised) return;
    initialised = true;
    const byId = id => document.getElementById(id);
    video = byId('process-video');
    els = {
      story: byId('montagem'), play: byId('film-play'), playLabel: byId('film-play-label'),
      restart: byId('film-restart'), previous: byId('film-prev'), next: byId('film-next'),
      speed: byId('film-speed'), fullscreen: byId('film-fullscreen'), progress: byId('film-progress'),
      time: byId('film-time'), status: byId('film-status'), chapters: byId('process-chapters'),
      number: byId('process-number'), title: byId('process-title'), description: byId('process-description'),
      specs: byId('process-specs'), caption: byId('film-caption'), scrollMode: byId('film-scroll-mode'), scrollLabel: byId('film-scroll-mode-label'), scrollHelp: byId('film-scroll-help')
    };
    const configuredDuration = Number(window.BRASA_FILM_TOTAL);
    fallbackDuration = Number.isFinite(configuredDuration) && configuredDuration > 0 ? configuredDuration : 0;
    chapters = (Array.isArray(window.BRASA_FILM_CHAPTERS) ? window.BRASA_FILM_CHAPTERS : [])
      .filter(chapter => chapter && Number.isFinite(Number(chapter.start)) && Number(chapter.start) >= 0)
      .map(chapter => ({
        start: Number(chapter.start),
        end: Number.isFinite(Number(chapter.end)) ? Number(chapter.end) : fallbackDuration,
        label: typeof chapter.label === 'string' ? chapter.label : 'Cena do preparo',
        title: typeof chapter.title === 'string' ? chapter.title : (typeof chapter.label === 'string' ? chapter.label : 'Preparo real'),
        description: typeof chapter.description === 'string' ? chapter.description : '',
        specs: Array.isArray(chapter.specs) ? chapter.specs.filter(spec => typeof spec === 'string').slice(0, 12) : []
      })).sort((a, b) => a.start - b.start);
    renderChapters();
    if (!video) {
      setStatus('O vídeo do preparo não está disponível.');
      return;
    }
    const mobileSource = video.getAttribute('data-mobile-src');
    const desktopSource = video.getAttribute('data-desktop-src');
    const selectedSource = mobileSource && (window.matchMedia('(max-width: 760px)').matches || navigator.connection?.saveData) ? mobileSource : desktopSource;
    if (selectedSource) {
      video.src = selectedSource;
      video.load();
    }
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    if (els.speed) {
      const rate = Number(els.speed.value);
      video.playbackRate = [1, 0.75, 0.5].includes(rate) ? rate : 1;
    }
    setStatus('Assistir ao preparo');
    updateUI();

    const metadataReady = () => {
      if (pendingProgress !== null && duration() > 0) {
        pendingSeek = duration() * pendingProgress / 100;
        pendingProgress = null;
      }
      flushSeek();
      updateUI();
      if (!desiredPlaying && pendingSeek === null && !userInteracted) setStatus('Vídeo real pronto. Toque para assistir ou escolha uma etapa.');
      scheduleAutoplay();
    };
    video.addEventListener('loadedmetadata', metadataReady);
    video.addEventListener('loadeddata', () => { metadataReady(); requestFrameUpdate(); });
    video.addEventListener('canplay', () => {
      flushSeek();
      if (!desiredPlaying && !userInteracted) setStatus('Vídeo real pronto. Toque para assistir ou escolha uma etapa.');
      scheduleAutoplay();
    });
    video.addEventListener('timeupdate', updateUI);
    video.addEventListener('play', () => {
      sceneSelected = true;
      if (ownsFullscreen() && video.controls) {
        markInteraction();
        desiredPlaying = true;
        playGeneration += 1;
      }
    });
    video.addEventListener('seeked', () => {
      seekLocked = false;
      updateUI();
      flushSeek();
      requestFrameUpdate();
    });
    video.addEventListener('playing', () => {
      if (!desiredPlaying) {
        video.pause();
        return;
      }
      setStatus('Assistindo ao preparo real.');
      updateUI();
      requestFrameUpdate();
    });
    video.addEventListener('pause', () => {
      if (video.paused) {
        desiredPlaying = false;
        playGeneration += 1;
        if (ownsFullscreen()) setStatus('Vídeo pausado. Toque para continuar.');
      }
      cancelFrameUpdate();
      updateUI();
    });
    video.addEventListener('ended', () => {
      desiredPlaying = false;
      cancelFrameUpdate();
      updateUI();
      setStatus('Preparo concluído. Volte ao início para assistir de novo.');
    });
    video.addEventListener('waiting', () => {
      if (desiredPlaying) setStatus('Carregando a próxima cena…');
    });
    video.addEventListener('error', () => {
      desiredPlaying = false;
      playGeneration += 1;
      cancelFrameUpdate();
      cancelAutoplay();
      updateUI();
      setStatus('Não foi possível carregar o vídeo. Recarregue a página para tentar novamente.');
    });
    video.addEventListener('ratechange', () => {
      if (els.speed) els.speed.value = String(video.playbackRate);
      updateUI();
    });

    els.play?.addEventListener('click', () => {
      markInteraction();
      if (desiredPlaying || !video.paused) {
        pause();
        setStatus('Vídeo pausado. Toque para continuar.');
      } else void play();
    });
    els.restart?.addEventListener('click', () => seek(0, 'Vídeo no início. Toque para assistir.'));
    els.scrollMode?.addEventListener('click', () => setScrollMode(!scrollMode));
    els.previous?.addEventListener('click', () => selectChapter(activeChapter - 1));
    els.next?.addEventListener('click', () => selectChapter(activeChapter + 1));
    els.progress?.addEventListener('input', () => seek(els.progress.value));
    els.speed?.addEventListener('change', () => {
      markInteraction();
      const rate = Number(els.speed.value);
      video.playbackRate = [1, 0.75, 0.5].includes(rate) ? rate : 1;
      setStatus(`Velocidade: ${String(video.playbackRate).replace('.', ',')}×.`);
    });
    els.fullscreen?.addEventListener('click', () => { void toggleFullscreen(); });
    document.addEventListener('fullscreenchange', () => {
      if (ownsFullscreen()) enableFullscreenControls();
      else restoreFullscreenControls();
      if (els.fullscreen) {
        const fullscreen = ownsFullscreen();
        els.fullscreen.setAttribute('aria-pressed', String(fullscreen));
        els.fullscreen.setAttribute('aria-label', fullscreen ? 'Sair da tela cheia' : 'Assistir em tela cheia');
      }
    });
    video.addEventListener('webkitbeginfullscreen', enableFullscreenControls);
    video.addEventListener('webkitendfullscreen', restoreFullscreenControls);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        cancelAutoplay();
        pause('Vídeo pausado enquanto a página está em segundo plano.');
      } else scheduleAutoplay();
    });
    document.addEventListener('pointerdown', markInteraction, { passive: true });
    document.addEventListener('keydown', markInteraction);
    document.addEventListener('wheel', markInteraction, { passive: true });
    document.addEventListener('touchstart', markInteraction, { passive: true });
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('#cart-open, [data-product]') : null;
      if (target) {
        cancelAutoplay();
        pause('Vídeo pausado enquanto você monta o pedido.');
      }
    });
    const dialogObserver = new MutationObserver(() => {
      if (hasOpenDialog()) {
        cancelAutoplay();
        pause('Vídeo pausado enquanto você monta o pedido.');
      }
    });
    document.querySelectorAll('dialog').forEach(dialog => dialogObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
    window.addEventListener('scroll', scheduleScroll, { passive: true });
    window.addEventListener('resize', () => {
      updateUI();
      if (!inViewport(video)) pause('Vídeo pausado fora da tela.');
    }, { passive: true });
    reducedMotion.addEventListener('change', () => {
      cancelAutoplay();
      if (reducedMotion.matches) { if (scrollMode) setScrollMode(false); pause(); setStatus('Montagem automática desativada pela preferência de movimento reduzido. Toque para assistir.'); }
    });
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) {
            cancelAutoplay();
            pause('Vídeo pausado fora da tela.');
          } else if (performance.now() - lastScrollTime > 100) scheduleAutoplay();
        });
      }, { threshold: 0 });
      observer.observe(video);
      if (els.story) observer.observe(els.story);
    }
    if (video.readyState >= 1) metadataReady();
  }

  window.BrasaCooking = Object.freeze({
    seek,
    setScrollMode,
    get scrollMode() { return scrollMode; },
    get chapters() { return chapters.map(chapter => ({ ...chapter, specs: [...chapter.specs] })); },
    get playing() { return Boolean(video && !video.paused && !video.ended); },
    get progress() { return percent(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
