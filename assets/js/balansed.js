/*
 * BALANSED front-end behaviour (no dependencies).
 *  - Menu drawer: open/close, Escape, focus kept inside while open.
 *  - Header search pill: the collapsed pill expands into the input on the
 *    first click; an empty search is never submitted.
 *  - Scroll-triggered reveal: sections rise in, content, words and
 *    illustrations animate as they scroll into view; videos play on screen.
 *  - Consortium page: topic switches, partner panels, map highlight.
 *  - Study regions ring; popups ([data-bl-dialog] -> <dialog>).
 */
(function () {
    'use strict';

    function initDrawer() {
        var drawer = document.querySelector('[data-bl-drawer]');
        var opener = document.querySelector('[data-bl-menu-open]');
        if (!drawer || !opener) return;

        var panel = drawer.querySelector('.bl-drawer__panel');
        var focusable = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';
        var muted = [];

        // While open, everything outside the drawer is inert: screen readers
        // and the keyboard stay in the menu (it is a modal), not just Tab.
        function setPageInert(on) {
            if (!on) {
                muted.forEach(function (el) { el.removeAttribute('inert'); });
                muted = [];
                return;
            }
            for (var el = drawer; el && el !== document.body; el = el.parentElement) {
                Array.prototype.forEach.call(el.parentElement.children, function (sib) {
                    if (sib !== el && !sib.hasAttribute('inert') && !/^(SCRIPT|STYLE|LINK)$/.test(sib.tagName)) {
                        sib.setAttribute('inert', '');
                        muted.push(sib);
                    }
                });
            }
        }

        function open() {
            drawer.hidden = false;
            // Next frame so the transition runs from the closed state.
            requestAnimationFrame(function () {
                drawer.classList.add('is-open');
            });
            document.documentElement.classList.add('bl-drawer-open');
            opener.setAttribute('aria-expanded', 'true');
            setPageInert(true);
            panel.focus();
            document.addEventListener('keydown', onKey);
        }

        function close() {
            drawer.classList.remove('is-open');
            document.documentElement.classList.remove('bl-drawer-open');
            setPageInert(false);
            opener.setAttribute('aria-expanded', 'false');
            document.removeEventListener('keydown', onKey);
            setTimeout(function () {
                if (!drawer.classList.contains('is-open')) drawer.hidden = true;
            }, 350);
            opener.focus();
        }

        function onKey(e) {
            if (e.key === 'Escape') {
                close();
                return;
            }
            if (e.key !== 'Tab') return;
            var items = panel.querySelectorAll(focusable);
            if (!items.length) return;
            var first = items[0];
            var last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }

        opener.addEventListener('click', open);
        drawer.querySelectorAll('[data-bl-menu-close]').forEach(function (el) {
            el.addEventListener('click', close);
        });

        // Parent items expand their sub-links in place (one open at a time).
        var parents = Array.prototype.slice.call(drawer.querySelectorAll('[data-bl-nav-parent]'));
        function setOpen(item, isOpen) {
            item.classList.toggle('is-open', isOpen);
            item.querySelector('.bl-nav__toggle').setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
        parents.forEach(function (item) {
            item.querySelector('.bl-nav__toggle').addEventListener('click', function () {
                var willOpen = !item.classList.contains('is-open');
                parents.forEach(function (other) {
                    if (other !== item) setOpen(other, false);
                });
                setOpen(item, willOpen);
            });
        });
    }

    function initSearch() {
        document.querySelectorAll('[data-bl-search]').forEach(function (form) {
            var input = form.querySelector('input');

            form.addEventListener('submit', function (e) {
                if (input.value.trim()) return;
                e.preventDefault();
                form.classList.add('is-open');
                input.focus();
            });

            input.addEventListener('focus', function () {
                form.classList.add('is-open');
            });

            form.addEventListener('focusout', function () {
                setTimeout(function () {
                    if (!form.contains(document.activeElement) && !input.value.trim()) {
                        form.classList.remove('is-open');
                    }
                }, 0);
            });

            input.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    input.value = '';
                    input.blur();
                }
            });
        });
    }

    /*
     * Scroll-triggered reveal. Every section of the page (and the footer)
     * gets .bl-reveal; when it scrolls into view it gets .is-inview, which
     * starts its CSS animations (assets/less/balansed/motion.less):
     *  - the section rises into place,
     *  - its content items fade/slide in one after another (--d delay),
     *  - headings and statements animate word by word (--w delay),
     *  - illustrations play their own entrance.
     * Videos inside a section play while it is on screen and pause when it
     * leaves. Top banners (homepage hero, page hero) reveal on load.
     * Reduced motion: everything is shown at once, videos don't autoplay.
     */
    var REVEAL_ITEMS = [
        '.bl-eyebrow', '.bl-lead', '.bl-btn', '.bl-switch', '.bl-topics', '.bl-empty', '.bl-pager',
        '.bl-card', '.bl-wp', '.bl-doc', '.bl-partner', '.bl-month', '.bl-month-bar', '.bl-will__card',
        '.bl-intro__img', '.bl-why__img', '.bl-result__banner', '.bl-round-arrow', '.bl-logos li',
        '.bl-together__stats li', '.bl-follow__row', '.bl-article__head', '.bl-prose', '.bl-share',
        '.bl-article__gallery', '.bl-tags', '.bl-region__photo', '.bl-region__text > *', '.bl-events-bar',
        '.bl-success__ring', '.bl-regions__stage', '.bl-hero__actions', '.bl-hero__aim', '.bl-page-hero__crumb',
        '.bl-footer__top', '.bl-footer__fund', '.bl-footer__legal'
    ].join(',');

    var REVEAL_WORDS = [
        '.bl-hero__title', '.bl-page-hero__title', '.bl-statement', '.bl-h2', '.bl-together__title',
        '.bl-success__title', '.bl-follow__text', '.bl-evidence__text',
        '.bl-regions__lead', '.bl-result__claim', '.bl-will__text',
        '.bl-article__related-title', '.bl-region__h'
    ].join(',');

    // Statements revealed line by line (each line rises from below, top to
    // bottom), triggered when the statement itself scrolls into view.
    var REVEAL_LINES = '.bl-intro .bl-statement';

    // Number each word's line (--l) from its position on screen.
    function measureLines(el) {
        var top = null, line = -1;
        el.querySelectorAll('.bl-w').forEach(function (w) {
            var t = Math.round(w.getBoundingClientRect().top);
            if (top === null || Math.abs(t - top) > 4) {
                top = t;
                line++;
            }
            w.style.setProperty('--l', line);
        });
    }

    // Wrap each word of el's text in <span class="bl-w"><span>word</span></span>,
    // keeping inner elements (e.g. .bl-thin) and the spaces between words.
    function splitWords(el, counter) {
        Array.prototype.slice.call(el.childNodes).forEach(function (node) {
            if (node.nodeType === 3) {
                var parts = node.textContent.split(/(\s+)/);
                if (parts.length === 1 && !parts[0]) return;
                var frag = document.createDocumentFragment();
                parts.forEach(function (part) {
                    if (!part) return;
                    if (/^\s+$/.test(part)) {
                        frag.appendChild(document.createTextNode(part));
                        return;
                    }
                    var outer = document.createElement('span');
                    var inner = document.createElement('span');
                    outer.className = 'bl-w';
                    outer.style.setProperty('--w', Math.min(counter.n++, 24));
                    inner.textContent = part;
                    outer.appendChild(inner);
                    frag.appendChild(outer);
                });
                node.parentNode.replaceChild(frag, node);
            } else if (node.nodeType === 1 && !node.classList.contains('sr-only')) {
                splitWords(node, counter);
            }
        });
    }

    function initReveal() {
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var main = document.querySelector('.bl-main');
        window.blRevealReady = true;
        if (!main) {
            document.documentElement.classList.remove('bl-motion');
            return;
        }

        var sections = Array.prototype.slice.call(main.querySelectorAll(':scope > section, :scope > .bl-band'));
        var footer = document.querySelector('.bl-footer');
        if (footer) sections.push(footer);
        sections = sections.concat(Array.prototype.slice.call(document.querySelectorAll('[data-bl-inview]')))
            .filter(function (el, i, all) { return all.indexOf(el) === i; });

        var lineTargets = [];
        sections.forEach(function (section) {
            section.classList.add('bl-reveal');
            if (section.matches('.bl-hero, .bl-page-hero')) section.classList.add('bl-reveal--top');

            Array.prototype.slice.call(section.querySelectorAll(REVEAL_ITEMS)).forEach(function (item, i) {
                // Items nested in another item animate with their parent.
                if (item.parentElement.closest('[data-bl-item]') && section.contains(item.parentElement.closest('[data-bl-item]'))) return;
                item.setAttribute('data-bl-item', '');
                item.style.setProperty('--d', Math.min(i, 10) * 70 + 'ms');
            });

            if (!reduce) {
                section.querySelectorAll(REVEAL_WORDS).forEach(function (el) {
                    if (!el.querySelector('.bl-w')) splitWords(el, { n: 0 });
                    el.classList.add('bl-words');
                });
                section.querySelectorAll(REVEAL_LINES).forEach(function (el) {
                    el.classList.add('bl-lines');
                    lineTargets.push(el);
                });
            }

            // The map: countries fade in one after another.
            section.querySelectorAll('.bl-map [data-country]').forEach(function (path, i) {
                path.style.setProperty('--d', (i * 35) + 'ms');
            });
        });

        var videos = Array.prototype.slice.call(main.querySelectorAll('video'));

        if (!('IntersectionObserver' in window) || reduce) {
            document.documentElement.classList.remove('bl-motion');
            sections.forEach(function (s) { s.classList.add('is-inview'); });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-inview');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
        sections.forEach(function (s) { io.observe(s); });

        // Line-by-line statements: measure their lines (again on resize until
        // they have played) and start each one when it is on screen.
        if (lineTargets.length) {
            lineTargets.forEach(measureLines);
            var resizeTimer;
            window.addEventListener('resize', function () {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(function () {
                    lineTargets.forEach(function (el) {
                        if (!el.classList.contains('is-inview')) measureLines(el);
                    });
                }, 150);
            });
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(function () {
                    lineTargets.forEach(function (el) {
                        if (!el.classList.contains('is-inview')) measureLines(el);
                    });
                });
            }
            var lio = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-inview');
                        lio.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.4, rootMargin: '0px 0px -10% 0px' });
            lineTargets.forEach(function (el) { lio.observe(el); });
        }

        // Videos: play while on screen, pause when scrolled away.
        if (videos.length) {
            var vio = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    var v = entry.target;
                    if (entry.isIntersecting) {
                        v.muted = true;
                        var p = v.play();
                        if (p && p.catch) p.catch(function () {});
                    } else {
                        v.pause();
                    }
                });
            }, { threshold: 0.35 });
            videos.forEach(function (v) {
                v.removeAttribute('autoplay');
                v.pause();
                vio.observe(v);
            });
        }
    }

    /*
     * Consortium page: topic switches filter the partner tiles, "Read more"
     * swaps the grid for that partner's panel, and the map highlights the
     * matching countries (.is-active) while a topic or partner is selected.
     */
    function initConsortium() {
        var root = document.querySelector('[data-bl-consortium]');
        if (!root) return;

        var list = root.querySelector('[data-bl-partners]');
        var empty = root.querySelector('[data-bl-partners-empty]');
        var tiles = Array.prototype.slice.call(list.children);
        var panels = Array.prototype.slice.call(root.querySelectorAll('.bl-partner-panel'));
        var switches = Array.prototype.slice.call(root.querySelectorAll('[data-bl-topic]'));
        var map = root.querySelector('.bl-map');
        var lastTile = null;

        function words(el, attr) {
            return (el.getAttribute(attr) || '').split(' ').filter(Boolean);
        }

        function paintMap(countries) {
            if (!map) return;
            map.classList.toggle('has-selection', !!countries);
            map.querySelectorAll('[data-country]').forEach(function (path) {
                path.classList.toggle('is-active', !!countries && countries.indexOf(path.getAttribute('data-country')) !== -1);
            });
        }

        function filter() {
            var on = switches.filter(function (s) { return s.checked; }).map(function (s) { return s.value; });
            var countries = [];
            var shown = 0;
            tiles.forEach(function (li) {
                var match = !on.length || words(li, 'data-topics').some(function (t) { return on.indexOf(t) !== -1; });
                li.hidden = !match;
                if (match) {
                    shown++;
                    countries = countries.concat(words(li, 'data-countries'));
                }
            });
            empty.hidden = shown > 0;
            paintMap(on.length ? countries : null);
            return shown;
        }

        function open(id, focus) {
            var panel = document.getElementById(id);
            if (!panel) return;
            panels.forEach(function (p) { p.hidden = p !== panel; });
            list.hidden = true;
            empty.hidden = true;
            root.classList.add('is-detail');
            paintMap(words(panel, 'data-countries'));
            if (focus) panel.focus();
        }

        function close() {
            panels.forEach(function (p) { p.hidden = true; });
            list.hidden = false;
            root.classList.remove('is-detail');
            if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
            filter();
            if (lastTile) lastTile.focus();
        }

        panels.forEach(function (p) { p.hidden = true; });
        root.classList.add('is-ready');

        switches.forEach(function (s) {
            s.addEventListener('change', function () {
                if (root.classList.contains('is-detail')) close();
                var shown = filter();
                // Screen readers hear the result (accessibility.js live region).
                if (window.a11yAnnounce) {
                    window.a11yAnnounce(shown ? shown + (shown === 1 ? ' partner' : ' partners') + ' shown' : 'No partners match the selected topics');
                }
            });
        });

        root.querySelectorAll('[data-bl-partner]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                e.preventDefault();
                lastTile = a;
                if (history.replaceState) history.replaceState(null, '', '#' + a.getAttribute('data-bl-partner'));
                open(a.getAttribute('data-bl-partner'), true);
            });
        });

        root.querySelectorAll('[data-bl-partner-close]').forEach(function (b) {
            b.addEventListener('click', close);
        });

        root.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && root.classList.contains('is-detail')) close();
        });

        filter();
        if (location.hash && document.getElementById(location.hash.slice(1)) && /^#partner-/.test(location.hash)) {
            lastTile = root.querySelector('[data-bl-partner="' + location.hash.slice(1) + '"]');
            open(location.hash.slice(1), false);
        }
    }

    /*
     * Study regions: picking a region photo turns the ring so that region
     * sits at the top (active: full photo, "Learn more" = its page link, its
     * name on the globe). Arrow keys turn the ring one region at a time.
     */
    function initRegions() {
        var root = document.querySelector('[data-bl-regions]');
        if (!root) return;

        var step = parseFloat(root.getAttribute('data-step')) || 31.3;
        var items = Array.prototype.slice.call(root.querySelectorAll('.bl-regions__item'));
        var span = items.length * step;
        var label = root.querySelector('[data-bl-region-label]');
        var real = items.filter(function (li) { return li.querySelector('[data-bl-region]'); });
        var current = 0;

        function angleOf(i, k) {
            var a = (((i - k) * step) % span + span) % span;
            return a >= span / 2 ? a - span : a;
        }

        function select(k, source) {
            current = k;
            items.forEach(function (li, i) {
                var before = parseFloat(li.style.getPropertyValue('--a')) || 0;
                var a = angleOf(i, k);
                // Wrapping from one side to the other: jump, don't sweep across.
                if (Math.abs(a - before) > 180) {
                    li.style.transition = 'none';
                    li.style.setProperty('--a', a + 'deg');
                    void li.offsetWidth;
                    li.style.transition = '';
                } else {
                    li.style.setProperty('--a', a + 'deg');
                }
                li.classList.toggle('is-active', i === k);
                li.classList.toggle('is-hidden', Math.abs(a) > 100);
                var link = li.querySelector('[data-bl-region]');
                if (link) {
                    link.setAttribute('tabindex', Math.abs(a) > 100 ? '-1' : '0');
                    if (i === k) link.setAttribute('aria-current', 'true');
                    else link.removeAttribute('aria-current');
                }
            });
            var active = items[k].querySelector('[data-bl-region]');
            if (label && active) label.textContent = active.getAttribute('data-name');
            root.dispatchEvent(new CustomEvent('bl-region-select', { detail: { index: k, source: source || 'ring' } }));
        }
        root.blSelect = function (k, source) { if (k !== current) select(k, source); };
        root.blCurrent = function () { return current; };

        items.forEach(function (li, i) {
            var link = li.querySelector('[data-bl-region]');
            if (!link) return;
            link.addEventListener('click', function (e) {
                if (i === current) {
                    // The active one opens its page - through the zoom.
                    if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && zoomOpen(link)) e.preventDefault();
                    return;
                }
                e.preventDefault();
                select(i);
                link.focus();
            });
        });

        root.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' || real.length < 2) return;
            e.preventDefault();
            var pos = real.indexOf(items[current]);
            pos = (pos + (e.key === 'ArrowRight' ? 1 : -1) + real.length) % real.length;
            var next = items.indexOf(real[pos]);
            select(next);
            items[next].querySelector('[data-bl-region]').focus();
        });

        // Back from a region page (zoomBack): that region starts active,
        // placed at once (no ring sweep), at the scroll position the region
        // page was left at, and the navy section shrinks into its circle.
        var trip = readTrip('back');
        var start = 0;
        if (trip) {
            items.forEach(function (li, i) {
                var a = li.querySelector('[data-bl-region]');
                if (a && slugOf(a) === trip.slug) start = i;
            });
            root.blBack = true;
            root.classList.add('is-instant');
        }
        select(start, 'init');
        initGlobe(root, items);
        if (trip) zoomBack(root, items[start], trip);
    }

    // -- Study region trip (overview <-> region page) ------------------------
    // The two pages share the banner and the section's place, so the trip
    // stays in the section: the navy fills it from around the photo, and
    // the region page opens at the same scroll position with that photo in
    // the same spot. sessionStorage "bl-region-trip" carries {dir, slug, y
    // (scroll), rect (the photo relative to the section)}; the layout's
    // head script sees it and flags <html> with .bl-region-enter.
    var TRIP = 'bl-region-trip', FROM = 'bl-region-from';
    function slugOf(a) { return a.pathname.replace(/\/+$/, '').split('/').pop(); }
    function readTrip(dir) {
        var t = null;
        try {
            t = JSON.parse(sessionStorage.getItem(TRIP) || 'null');
            if (t && t.dir === dir) sessionStorage.removeItem(TRIP);
        } catch (e) { t = null; }
        return t && t.dir === dir ? t : null;
    }
    function writeTrip(t) {
        try { sessionStorage.setItem(TRIP, JSON.stringify(t)); } catch (e) {}
    }
    function canTrip() {
        return document.documentElement.classList.contains('bl-motion') && !!document.body.animate;
    }
    function relRect(el, section) {
        var r = el.getBoundingClientRect(), s = section.getBoundingClientRect();
        return { x: r.left - s.left, y: r.top - s.top, w: r.width };
    }
    // A layer clipped to the section (same rounded corners) holding a navy
    // circle and a copy of the photo at rect.
    function tripLayer(section, rect, src) {
        var wrap = document.createElement('div');
        wrap.className = 'bl-zoom';
        wrap.setAttribute('aria-hidden', 'true');
        var circle = document.createElement('span');
        circle.className = 'bl-zoom__circle';
        var photo = document.createElement('span');
        photo.className = 'bl-zoom__photo';
        [circle, photo].forEach(function (el) {
            el.style.left = rect.x + 'px';
            el.style.top = rect.y + 'px';
            el.style.width = el.style.height = rect.w + 'px';
        });
        if (src) photo.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
        wrap.appendChild(circle);
        wrap.appendChild(photo);
        section.appendChild(wrap);
        // Scale at which the circle covers the whole section.
        var w = section.offsetWidth, h = section.offsetHeight, cx = rect.x + rect.w / 2, cy = rect.y + rect.w / 2;
        var far = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
        return { wrap: wrap, circle: circle, photo: photo, scale: (2 * far) / rect.w + .05 };
    }

    /*
     * "Learn more" on the active region (designer's reference): the photo
     * stays put while a navy circle grows from around it until the whole
     * section is navy - then the region page opens, its navy section in the
     * same place (initRegionEnter takes over from there). Returns false
     * when it can't run (reduced motion, no Web Animations): the link then
     * just opens.
     */
    function zoomOpen(link) {
        if (!canTrip()) return false;
        var section = link.closest('.bl-regions');
        if (!section) return false;
        var src = link.querySelector('img');
        var rect = relRect(link, section);
        var layer = tripLayer(section, rect, src && (src.currentSrc || src.src));
        link.classList.add('is-opening');

        var go = function () {
            if (go.done) return;
            go.done = true;
            var t = { dir: 'enter', slug: slugOf(link), y: window.pageYOffset, rect: rect };
            writeTrip(t);
            try { sessionStorage.setItem(FROM, JSON.stringify(t)); } catch (e) {}
            window.location.assign(link.href);
        };
        var grow = layer.circle.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + layer.scale + ')' }],
            { duration: 380, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' });
        grow.onfinish = go;
        setTimeout(go, 650);    // in case the animation never reports back

        // Coming back with the browser's back button: undo.
        window.addEventListener('pageshow', function (e) {
            if (!e.persisted) return;
            if (layer.wrap.parentNode) layer.wrap.parentNode.removeChild(layer.wrap);
            link.classList.remove('is-opening');
            go.done = false;
        }, { once: true });
        return true;
    }

    /*
     * The reverse, on the overview after "Back to study regions": the
     * section starts navy (.bl-region-enter) with the photo where the
     * region page left it; the navy circle shrinks back into the photo's
     * circle and the overview shows again.
     */
    function zoomBack(root, li, trip) {
        var html = document.documentElement;
        var done = function () {
            html.classList.remove('bl-region-enter');
            root.classList.remove('is-instant');
        };
        var link = li.querySelector('[data-bl-region]');
        if (!link || !canTrip()) { done(); return; }
        window.scrollTo(0, trip.y || 0);
        requestAnimationFrame(function () {
            var src = link.querySelector('img');
            var layer = tripLayer(root, relRect(link, root), src && (src.currentSrc || src.src));
            layer.circle.style.transform = 'scale(' + layer.scale + ')';
            done();   // the layer covers the section now
            var shrink = layer.circle.animate([{ transform: 'scale(' + layer.scale + ')' }, { transform: 'scale(1)' }],
                { duration: 380, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' });
            var end = function () {
                if (end.done) return;
                end.done = true;
                var fade = layer.wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
                fade.onfinish = function () { if (layer.wrap.parentNode) layer.wrap.parentNode.removeChild(layer.wrap); };
            };
            shrink.onfinish = end;
            setTimeout(end, 650);
        });
    }

    /*
     * Study region page. Arriving from "Learn more" (a trip): same scroll
     * position as the overview, the clicked photo appears where its circle
     * was, then moves into its place while the other two photos come out
     * from behind it; the globe settles and the texts come out towards the
     * right. A direct visit plays the CSS arrival instead (photos flying
     * out of the globe). "Back to study regions" runs it all in reverse.
     */
    function initRegionEnter() {
        var region = document.querySelector('.bl-region');
        if (!region) return;
        var html = document.documentElement;
        var trip = readTrip('enter');
        html.classList.remove('bl-region-enter');
        if (!html.classList.contains('bl-motion')) return;
        var photos = Array.prototype.slice.call(region.querySelectorAll('.bl-region__photo'));

        // The transform that puts photo p over a rect given relative to the
        // section.
        function toward(p, rect) {
            var r = p.getBoundingClientRect(), s = region.getBoundingClientRect();
            var dx = (s.left + rect.x + rect.w / 2) - (r.left + r.width / 2);
            var dy = (s.top + rect.y + rect.w / 2) - (r.top + r.height / 2);
            return 'translate(' + dx + 'px, ' + dy + 'px) scale(' + (rect.w / r.width) + ')';
        }

        if (trip && trip.rect && document.body.animate) {
            window.scrollTo(0, trip.y || 0);
            region.classList.add('is-zoomed');
            photos.forEach(function (p, i) {
                var from = toward(p, trip.rect);
                if (i === 0) {
                    // The clicked photo: a beat where it was, then into place.
                    p.animate([
                        { transform: from, opacity: 1 },
                        { transform: from, opacity: 1, offset: .056 },
                        { transform: 'none', opacity: 1 }
                    ], { duration: 800, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'backwards' });
                } else {
                    // The others come out from behind it.
                    p.animate([
                        { transform: from + ' scale(.85)', opacity: 0 },
                        { opacity: 1, offset: .3 },
                        { transform: 'none', opacity: 1 }
                    ], { duration: 700, delay: 180 + i * 80, easing: 'cubic-bezier(.3, 1.25, .5, 1)', fill: 'backwards' });
                }
            });
        }

        // "Back to study regions": texts out to the left, globe away, the
        // photos gather back into the circle they came from - then the
        // overview opens and zoomBack shrinks the navy into that circle.
        var backLink = region.querySelector('.bl-region__back');
        if (backLink && canTrip()) backLink.addEventListener('click', function (e) {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            var slug = window.location.pathname.replace(/\/+$/, '').split('/').pop();
            var rect = null;
            try {
                var from = JSON.parse(sessionStorage.getItem(FROM) || 'null');
                if (from && from.slug === slug) rect = from.rect;
            } catch (err) {}
            if (!rect) {
                // Not opened from the overview: where the active circle sits
                // there (desktop layout: stage 1100px wide at y=96, circle
                // 18.18cqw centred 9.09cqw from its top).
                if (window.innerWidth < 1200) return;   // stacked layout - a plain link
                var cq = Math.min(1100, region.clientWidth) / 100, w = 18.18 * cq;
                rect = { x: region.clientWidth / 2 - w / 2, y: 96 + 9.09 * cq - w / 2, w: w };
            }
            e.preventDefault();
            if (region.classList.contains('is-leaving')) return;
            region.classList.add('is-leaving');
            photos.forEach(function (p, i) {
                var to = toward(p, rect);
                p.animate(i === 0
                    ? [{ transform: 'none' }, { transform: to }]
                    : [{ transform: 'none', opacity: 1 }, { opacity: 1, offset: .5 }, { transform: to + ' scale(.85)', opacity: 0 }],
                    { duration: 380, delay: i === 0 ? 60 : (2 - i) * 30, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' });
            });
            var go = function () {
                if (go.done) return;
                go.done = true;
                writeTrip({ dir: 'back', slug: slug, y: window.pageYOffset, rect: rect });
                window.location.assign(backLink.href);
            };
            setTimeout(go, 450);
            window.addEventListener('pageshow', function (ev) {
                if (!ev.persisted) return;
                region.classList.remove('is-leaving');
                photos.forEach(function (p) { p.getAnimations().forEach(function (a) { a.cancel(); }); });
                go.done = false;
            }, { once: true });
        });

        requestAnimationFrame(function () {
            region.classList.add('is-entering');
        });
    }

    /*
     * Study regions - the globe as a canvas the visitor can drag round
     * (orthographic view of Natural Earth land, coloured like the design's
     * flat globe: navy sea, land fading from green to navy). Regions with
     * a latitude/longitude get a marker; the one turned to face the
     * visitor becomes the selected region (the ring brings its photo to
     * the top) and its marker pulses. Picking a photo on the ring turns
     * the globe to it. Released drags keep spinning a moment, then settle
     * on a region close to the front.
     */
    function initGlobe(root, items) {
        var canvas = root.querySelector('[data-bl-globe]');
        if (!canvas || !canvas.getContext || !window.fetch) return;
        var ctx = canvas.getContext('2d');
        var label = root.querySelector('[data-bl-region-label]');
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var RAD = Math.PI / 180;
        var NAVY = '#001629', GREEN = '#458C63', SAND = '#E8DDD2', SKY = '#D4E2E9', RING = '#BFCABF';
        var PICK = 25;      // a region within 25deg of the centre is "facing"
        var LAT_MIN = -35, LAT_MAX = 65;

        // Regions on the ring that have a place on the globe.
        var marks = [];
        items.forEach(function (li, i) {
            var a = li.querySelector('[data-bl-region][data-lat]');
            if (a) marks.push({ index: i, lat: parseFloat(a.getAttribute('data-lat')), lng: parseFloat(a.getAttribute('data-lng')), name: a.getAttribute('data-name') });
        });

        var land = null, size = 0, dpr = 1, R = 0, C = 0;
        var view = { lng: 10, lat: 38 };
        var layer = document.createElement('canvas');   // land, redrawn when the view moves
        var lctx = layer.getContext('2d');
        var dirty = true, visible = false, raf = null, t0 = performance.now();
        var drag = null, spin = 0, fly = null, started = false;

        function clampLat(v) { return Math.max(LAT_MIN, Math.min(LAT_MAX, v)); }
        function wrap(v) { return ((v + 180) % 360 + 360) % 360 - 180; }

        // Unit-sphere point in view space: x right, y up, z towards the viewer.
        function point(lng, lat) {
            var l = (lng - view.lng) * RAD, p = lat * RAD, p0 = view.lat * RAD;
            var cp = Math.cos(p);
            return [cp * Math.sin(l), Math.cos(p0) * Math.sin(p) - Math.sin(p0) * cp * Math.cos(l), Math.sin(p0) * Math.sin(p) + Math.cos(p0) * cp * Math.cos(l)];
        }

        // One land ring, clipped at the horizon: hidden stretches are
        // replaced by the arc of the rim between where the line left and
        // where it came back.
        function ring(c, flat) {
            var n = flat.length / 2, pts = new Array(n), first = -1, i;
            for (i = 0; i < n; i++) {
                pts[i] = point(flat[2 * i], flat[2 * i + 1]);
                if (first < 0 && pts[i][2] >= 0) first = i;
            }
            if (first < 0) return;
            var exit = null, prev = pts[first];
            c.moveTo(C + R * prev[0], C - R * prev[1]);
            for (var s = 1; s <= n; s++) {
                var q = pts[(first + s) % n];
                if (prev[2] >= 0 && q[2] >= 0) {
                    c.lineTo(C + R * q[0], C - R * q[1]);
                } else if (prev[2] >= 0 && q[2] < 0) {
                    exit = rim(prev, q);
                    c.lineTo(C + R * exit[0], C - R * exit[1]);
                } else if (prev[2] < 0 && q[2] >= 0) {
                    var entry = rim(q, prev);
                    if (exit) {
                        var a1 = Math.atan2(-exit[1], exit[0]), a2 = Math.atan2(-entry[1], entry[0]);
                        var d = a2 - a1;
                        while (d > Math.PI) d -= 2 * Math.PI;
                        while (d < -Math.PI) d += 2 * Math.PI;
                        c.arc(C, C, R, a1, a2, d < 0);
                    }
                    c.lineTo(C + R * q[0], C - R * q[1]);
                }
                prev = q;
            }
            c.closePath();
        }
        // Where the segment from a visible point to a hidden one crosses the rim.
        function rim(a, b) {
            var t = a[2] / (a[2] - b[2]);
            var x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, l = Math.sqrt(x * x + y * y) || 1;
            return [x / l, y / l];
        }

        function drawLand() {
            lctx.setTransform(1, 0, 0, 1, 0, 0);
            lctx.clearRect(0, 0, layer.width, layer.height);
            lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            lctx.beginPath();
            lctx.arc(C, C, R, 0, 2 * Math.PI);
            lctx.fillStyle = NAVY;
            lctx.fill();
            if (land) {
                var g = lctx.createLinearGradient(C - R, 0, C + R, 0);
                g.addColorStop(0, GREEN);
                g.addColorStop(1, NAVY);
                lctx.fillStyle = g;
                land.forEach(function (poly) {
                    lctx.beginPath();
                    poly.forEach(function (r) { ring(lctx, r); });
                    lctx.fill('evenodd');
                });
            }
            dirty = false;
        }

        function drawMarks(now) {
            var current = root.blCurrent ? root.blCurrent() : -1, shown = null;
            marks.forEach(function (m) {
                var p = point(m.lng, m.lat);
                m.on = false;
                if (p[2] <= 0) return;
                var x = C + R * p[0], y = C - R * p[1];
                var fade = Math.min(1, p[2] * 5);        // fade out towards the rim
                var r = Math.max(3.5, R * .028);
                // Where it was drawn, for clicks (see hit()).
                m.x = x;
                m.y = y;
                m.r = r;
                m.on = fade > .3;
                ctx.globalAlpha = fade;
                if (m.index === current) {
                    // Highlight: two rings rippling out, then the ringed dot.
                    for (var k = 0; k < 2; k++) {
                        var ph = reduce ? .35 : ((now - t0) / 1800 + k / 2) % 1;
                        ctx.beginPath();
                        ctx.arc(x, y, r * (1.6 + ph * 4.2), 0, 2 * Math.PI);
                        ctx.strokeStyle = SKY;
                        ctx.lineWidth = Math.max(1, R * .006);
                        ctx.globalAlpha = fade * (1 - ph) * .7;
                        ctx.stroke();
                    }
                    ctx.globalAlpha = fade;
                    ctx.beginPath();
                    ctx.arc(x, y, r * 1.55, 0, 2 * Math.PI);
                    ctx.fillStyle = RING;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(x, y, r * 1.2, 0, 2 * Math.PI);
                    ctx.fillStyle = GREEN;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(x, y, r * .38, 0, 2 * Math.PI);
                    ctx.fillStyle = SAND;
                    ctx.fill();
                    shown = { x: x, y: y, fade: fade, name: m.name };
                } else {
                    ctx.beginPath();
                    ctx.arc(x, y, r * .8, 0, 2 * Math.PI);
                    ctx.fillStyle = SKY;
                    ctx.globalAlpha = fade * .85;
                    ctx.fill();
                }
            });
            ctx.globalAlpha = 1;
            // The region's name rides above its marker.
            if (label && marks.length) {
                if (shown) {
                    label.style.left = (canvas.offsetLeft + shown.x) + 'px';
                    label.style.top = (canvas.offsetTop + shown.y) + 'px';
                    label.style.opacity = shown.fade;
                    label.textContent = shown.name;
                } else {
                    label.style.opacity = 0;
                }
            }
        }

        function render(now) {
            if (dirty) drawLand();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(layer, 0, 0);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawMarks(now);
        }

        // The region nearest the centre of the view, if it's facing us.
        function facing() {
            var best = null, bestZ = Math.cos(PICK * RAD);
            marks.forEach(function (m) {
                var z = point(m.lng, m.lat)[2];
                if (z > bestZ) { bestZ = z; best = m; }
            });
            return best;
        }

        function flyTo(m, ms) {
            var to = { lng: m.lng, lat: clampLat(m.lat) };
            if (reduce || !ms) { view.lng = to.lng; view.lat = to.lat; dirty = true; kick(); return; }
            fly = { from: { lng: view.lng, lat: view.lat }, dl: wrap(to.lng - view.lng), dp: to.lat - view.lat, start: performance.now(), ms: ms };
            spin = 0;
            kick();
        }

        function step(now) {
            raf = null;
            var moved = false;
            if (fly) {
                var t = Math.min(1, (now - fly.start) / fly.ms);
                var e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                view.lng = wrap(fly.from.lng + fly.dl * e);
                view.lat = fly.from.lat + fly.dp * e;
                moved = true;
                if (t >= 1) fly = null;
            } else if (!drag && Math.abs(spin) > .02) {
                view.lng = wrap(view.lng - spin);
                spin *= .94;
                moved = true;
                if (Math.abs(spin) <= .02) settle();
            }
            if (moved) { dirty = true; turning(); }
            if (drag || (moved && !fly)) pick();
            render(now);
            // Keep going while moving, or while visible to animate the pulse.
            if (fly || drag || Math.abs(spin) > .02 || (visible && marks.length && !reduce)) raf = requestAnimationFrame(step);
        }
        function kick() { if (!raf) raf = requestAnimationFrame(step); }

        // .is-turning on the stage while the globe or the ring moves: the
        // pins retract, and draw in again once everything has stopped
        // (the ring's own .8s turn is all but done by 650ms).
        var turnTimer = null;
        function turning() {
            root.classList.add('is-turning');
            clearTimeout(turnTimer);
            turnTimer = setTimeout(function check() {
                if (fly || drag || Math.abs(spin) > .02) turnTimer = setTimeout(check, 120);
                else root.classList.remove('is-turning');
            }, 650);
        }

        function pick() {
            var m = facing();
            if (m && root.blSelect) root.blSelect(m.index, 'globe');
        }
        // After a spin: snap to a region that's nearly in front.
        function settle() {
            spin = 0;
            var m = facing();
            if (m) flyTo(m, 700);
        }

        // The marker under the pointer (a little larger than drawn, for fingers).
        function hit(e) {
            var b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, best = null, bestD = Infinity;
            marks.forEach(function (m) {
                if (!m.on) return;
                var d = Math.sqrt((m.x - x) * (m.x - x) + (m.y - y) * (m.y - y));
                if (d <= Math.max(12, m.r * 2.4) && d < bestD) { bestD = d; best = m; }
            });
            return best;
        }

        // -- Dragging (and clicking a marker) -----------------------------------
        canvas.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || !land) return;
            drag = { x: e.clientX, y: e.clientY, id: e.pointerId, last: performance.now(), moved: 0 };
            canvas.style.cursor = '';
            fly = null;
            spin = 0;
            try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
            canvas.classList.add('is-dragging');
            kick();
        });
        canvas.addEventListener('pointermove', function (e) {
            if (!drag) {
                canvas.style.cursor = hit(e) ? 'pointer' : '';
                return;
            }
            if (e.pointerId !== drag.id) return;
            var k = 57.3 / R;                       // a radius dragged ~ 57deg turned
            var dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now();
            drag.moved += Math.abs(dx) + Math.abs(dy);
            view.lng = wrap(view.lng - dx * k);
            if (e.pointerType === 'mouse') view.lat = clampLat(view.lat + dy * k);
            spin = dx * k * Math.min(1, 16 / Math.max(1, now - drag.last));
            drag.x = e.clientX;
            drag.y = e.clientY;
            drag.last = now;
            dirty = true;
            kick();
        });
        function release(e) {
            if (!drag || e.pointerId !== drag.id) return;
            if (performance.now() - drag.last > 80) spin = 0;   // held still before letting go
            var clicked = drag.moved < 5 && e.type === 'pointerup' ? hit(e) : null;
            drag = null;
            canvas.classList.remove('is-dragging');
            if (clicked) {
                // A marker clicked: turn it to the front and make it the
                // selected region (top of the ring).
                spin = 0;
                if (root.blCurrent && root.blCurrent() === clicked.index) flyTo(clicked, 900);
                else if (root.blSelect) root.blSelect(clicked.index, 'dot');   // -> flies, see below
            } else if (reduce || Math.abs(spin) <= .02) settle();
            kick();
        }
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);

        // A photo picked on the ring, or a marker clicked: turn the globe to it.
        root.addEventListener('bl-region-select', function (e) {
            if (e.detail.source === 'init') return;
            turning();
            if (e.detail.source === 'globe') return;
            marks.forEach(function (m) { if (m.index === e.detail.index) flyTo(m, 1100); });
            if (!marks.some(function (m) { return m.index === e.detail.index; }) && label) label.style.opacity = 0;
        });

        function resize() {
            var w = canvas.clientWidth;
            if (!w) return;
            dpr = Math.min(2, window.devicePixelRatio || 1);
            size = w;
            C = w / 2;
            R = w / 2 - 1;
            canvas.width = layer.width = Math.round(w * dpr);
            canvas.height = layer.height = Math.round(w * dpr);
            dirty = true;
            kick();
        }
        if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
        else window.addEventListener('resize', resize);

        // Turn in from further east the first time the globe comes into view.
        function intro() {
            if (started) return;
            started = true;
            var first = marks.filter(function (m) { return m.index === (root.blCurrent ? root.blCurrent() : 0); })[0];
            if (!first) return;
            if (reduce || root.blBack) { flyTo(first); return; }   // back from a region: no intro spin
            view.lng = wrap(first.lng + 70);
            view.lat = clampLat(first.lat - 12);
            dirty = true;
            flyTo(first, 1800);
        }

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                visible = entries[0].isIntersecting;
                if (visible && land) intro();
                kick();
            }, { threshold: .35 }).observe(canvas);
        } else {
            visible = true;
        }

        fetch(canvas.getAttribute('data-land')).then(function (r) { return r.json(); }).then(function (json) {
            land = json.polys;
            if (marks.length) {
                var m = marks.filter(function (x) { return x.index === (root.blCurrent ? root.blCurrent() : 0); })[0] || marks[0];
                view.lng = wrap(m.lng + 70);
                view.lat = clampLat(m.lat - 12);
            }
            resize();
            root.classList.add('has-globe');
            if (marks.length) root.classList.add('has-marks');
            if (visible) intro();
        }).catch(function () {});
    }

    /*
     * Popups: a link with data-bl-dialog="<id>" opens <dialog id="<id>"> as a
     * modal. Closes with Escape, the [data-bl-dialog-close] button or a
     * click on the backdrop; focus returns to the link. #<id> in the URL
     * opens it on load (shareable).
     */
    function initDialogs() {
        var links = document.querySelectorAll('[data-bl-dialog]');
        if (!links.length) return;
        var opener = null;

        function clearHash() {
            if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
        }

        function open(dialog) {
            if (!dialog || typeof dialog.showModal !== 'function') return false;
            if (!dialog.open) dialog.showModal();
            document.documentElement.classList.add('bl-drawer-open');
            return true;
        }

        links.forEach(function (link) {
            link.addEventListener('click', function (e) {
                var dialog = document.getElementById(link.getAttribute('data-bl-dialog'));
                if (open(dialog)) {
                    e.preventDefault();
                    opener = link;
                    if (history.replaceState) history.replaceState(null, '', '#' + dialog.id);
                }
            });
        });

        document.querySelectorAll('dialog.bl-dialog').forEach(function (dialog) {
            dialog.addEventListener('close', function () {
                document.documentElement.classList.remove('bl-drawer-open');
                clearHash();
                if (opener) opener.focus();
            });
            // A click on the backdrop lands on the <dialog> itself.
            dialog.addEventListener('click', function (e) {
                if (e.target === dialog) dialog.close();
            });
            dialog.querySelectorAll('[data-bl-dialog-close]').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    dialog.close();
                });
            });
        });

        if (location.hash) {
            var target = document.getElementById(location.hash.slice(1));
            if (target && target.matches('dialog.bl-dialog')) {
                opener = document.querySelector('[data-bl-dialog="' + target.id + '"]');
                open(target);
            }
        }
    }

    /*
     * Scroll progress (0..1) through a content-height section that is
     * animated with the scroll (the drawing, the success ring), from when
     * its top is at START of the screen, as it scrolls up:
     *  - held at the top by the stacking (data-bl-hold, initStack - both
     *    sections): on through the hold, done with USE of it scrolled, so it
     *    is finished before the next section slides over it. The spacer
     *    after it scrolls normally: its top is the section's unpinned
     *    bottom edge;
     *  - without a hold (reduced motion: no stacking): done when its
     *    top reaches FINISH (default: the top of the screen).
     */
    function scrollThrough(root, START, FINISH) {
        FINISH = FINISH || 0;
        var USE = 0.8;
        var vh = window.innerHeight;
        var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
        var spacer = root.nextElementSibling;
        if (spacer && spacer.classList.contains('bl-stack-hold') && spacer.offsetHeight) {
            var h = root.offsetHeight;
            var travelled = vh * START + h - spacer.getBoundingClientRect().top;
            return clamp(travelled / (vh * START + spacer.offsetHeight * USE));
        }
        return clamp((vh * START - root.getBoundingClientRect().top) / (vh * (START - FINISH)));
    }

    /*
     * Homepage "BALANSED brings land and sea": three slides whose one-line
     * illustrations are sketched in step with the scroll. The section is as
     * tall as its canvas (pages/home.less); the scroll through it (0..1,
     * scrollThrough) picks the slide and how far its lines are drawn.
     * The drawn position eases toward the scroll position every frame, so
     * the pen moves smoothly even with a jumpy wheel - and scrolling on
     * simply carries past the section at any time.
     * Slide 3's blob wobbles like a voice, with echoes rippling out (CSS).
     *
     * The illustrations are generated into partials/balansed/drawing-art.htm
     * from the Figma SVGs (stroked lines; slide 1's outlined shapes are
     * revealed by a mask stroke along their outline).
     */
    function initDrawing() {
        var root = document.querySelector('[data-bl-drawing]');
        if (!root || !('IntersectionObserver' in window)) return;

        // -- Tuning -------------------------------------------------------
        var START = 0.55;    // start when the section top is at 55% of the screen (the art coming into view)
        var FINISH = 0.15;   // without the hold (reduced motion): fully drawn when it is at 15%
        var DRAW = 0.72;     // share of each slide's scroll spent drawing (the rest holds)
        var SMOOTH = 0.09;   // how fast the pen catches up with the scroll (0..1)
        var WOBBLE = 1;      // strength of the blob's "voice" wobble
        // -----------------------------------------------------------------

        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var slides = Array.prototype.slice.call(root.querySelectorAll('.bl-drawing__slide'));
        var texts = Array.prototype.slice.call(root.querySelectorAll('.bl-drawing__text'));
        var ring = root.querySelector('.bl-drawing__ring .bl-line');
        var blob = root.querySelector('.bl-drawing__blob-line');
        var echoes = Array.prototype.slice.call(root.querySelectorAll('.bl-drawing__echo'));
        var count = slides.length;

        // Each illustration (svg) is drawn as one pen stroke through its
        // paths in order, weighted by their real length.
        var arts = slides.map(function (slide) {
            return Array.prototype.slice.call(slide.querySelectorAll('svg')).map(function (svg) {
                var paths = Array.prototype.slice.call(svg.querySelectorAll('.bl-line'));
                var lengths = paths.map(function (p) {
                    try { return p.getTotalLength(); } catch (e) { return 1; }
                });
                var total = lengths.reduce(function (a, b) { return a + b; }, 0) || 1;
                return { paths: paths, lengths: lengths, total: total };
            });
        });

        function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
        function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

        function drawArt(art, d) {
            var done = d * art.total;
            art.paths.forEach(function (p, i) {
                var k = clamp(done / art.lengths[i]);
                done -= art.lengths[i];
                // A mask stroke runs along both edges of an outlined line,
                // so the line is fully shown at about half its length.
                if (p.classList.contains('bl-line--mask')) k = clamp(k * 1.9);
                p.style.strokeDashoffset = (1 - k).toFixed(4);
            });
        }

        // -- Blob wobble: the Figma outline, sampled into points and moved
        //    radially by a few travelling sine waves, redrawn smooth. --------
        var points = [];
        var centre = { x: 235, y: 235 };
        (function sample() {
            var len = blob.getTotalLength();
            var n = 72;
            for (var i = 0; i < n; i++) {
                var pt = blob.getPointAtLength(len * i / n);
                points.push({ x: pt.x, y: pt.y });
            }
            centre = points.reduce(function (c, p) { return { x: c.x + p.x / n, y: c.y + p.y / n }; }, { x: 0, y: 0 });
            points = points.map(function (p) {
                var dx = p.x - centre.x, dy = p.y - centre.y;
                return { a: Math.atan2(dy, dx), r: Math.sqrt(dx * dx + dy * dy) };
            });
        })();

        function blobPath(t, amp) {
            var pts = points.map(function (p) {
                var w = 0.024 * Math.sin(3 * p.a + t * 1.5)
                      + 0.017 * Math.sin(5 * p.a - t * 2.2)
                      + 0.010 * Math.sin(8 * p.a + t * 3.3);
                var r = p.r * (1 + amp * WOBBLE * w);
                return { x: centre.x + r * Math.cos(p.a), y: centre.y + r * Math.sin(p.a) };
            });
            // Closed Catmull-Rom spline through the points, as cubic Beziers.
            var n = pts.length, d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
            for (var i = 0; i < n; i++) {
                var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
                d += 'C' + (p1.x + (p2.x - p0.x) / 6).toFixed(1) + ' ' + (p1.y + (p2.y - p0.y) / 6).toFixed(1) +
                     ' ' + (p2.x - (p3.x - p1.x) / 6).toFixed(1) + ' ' + (p2.y - (p3.y - p1.y) / 6).toFixed(1) +
                     ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
            }
            return d + 'Z';
        }

        var current = 0, active = -1, visible = false, raf = null, blobDrawn = 0;

        function target() {
            return scrollThrough(root, START, FINISH);
        }

        function render(p, time) {
            var x = p * count;
            var now = Math.min(count - 1, Math.floor(x));
            var local = x - now;

            if (now !== active) {
                active = now;
                root.setAttribute('data-active', String(now));
                slides.forEach(function (s, i) { s.classList.toggle('is-active', i === now); });
                texts.forEach(function (t, i) { t.classList.toggle('is-active', i === now); });
            }

            arts.forEach(function (group, i) {
                var d = reduce ? 1 : i < now ? 1 : i > now ? 0 : ease(clamp(local / DRAW));
                group.forEach(function (art) { drawArt(art, d); });
            });

            // The circle draws at the very start; the blob on the last slide.
            if (ring) ring.style.strokeDashoffset = reduce ? 0 : (1 - ease(clamp(x / 0.35))).toFixed(4);
            blobDrawn = reduce ? 1 : now === count - 1 ? ease(clamp(local / 0.45)) : 0;
            blob.style.strokeDashoffset = (1 - blobDrawn).toFixed(4);
            root.classList.toggle('is-blob-drawn', blobDrawn > 0.97);

            if (!reduce && now === count - 1) {
                var d = blobPath(time / 1000, 0.35 + 0.65 * blobDrawn);
                blob.setAttribute('d', d);
                echoes.forEach(function (e) { e.setAttribute('d', d); });
            }
        }

        function frame(time) {
            raf = null;
            var goal = target();
            current += (goal - current) * (reduce ? 1 : SMOOTH);
            if (Math.abs(goal - current) < 0.0004) current = goal;
            render(current, time || 0);
            // Keep going while on screen (the blob wobbles even when still).
            if (visible) raf = requestAnimationFrame(frame);
        }

        new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
            if (visible && !raf) raf = requestAnimationFrame(frame);
        }).observe(root);

        current = target();
        render(current, 0);
    }

    /*
     * Stacking sections (designer's reference): every section of the page
     * sticks once it is fully in view and the next one slides up over it;
     * the covered section dims slightly as it disappears
     * (CSS in assets/less/balansed/motion.less, "Stacking sections").
     *  - sticky top = 0, or (screen - height) for sections taller than the
     *    screen, so their whole content scrolls by before they stick;
     *  - z-index rises down the page so each one covers the previous;
     *  - --cover (0..1) = how far the next section has come over this one.
     * Off with "reduce motion" (normal scrolling). Sections marked
     * data-bl-nostack scroll normally (no pinning) so consecutive ones
     * move together as one block (homepage Updates + Follow us).
     */
    function initStack() {
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var main = document.querySelector('.bl-main');
        if (reduce || !main) return;
        var sections = Array.prototype.slice.call(main.querySelectorAll(':scope > section, :scope > .bl-band'));
        if (sections.length < 2) return;
        document.documentElement.classList.add('bl-stack');

        var ticking = false;
        var built = [];   // per section: the next one's built-in overlap (px)
        var tints = [];   // per section: its background colour [r, g, b]
        var NAVY = [0, 22, 41];
        var root = document.documentElement;

        // Holds (data-bl-hold="<screens>"): a section animated with the
        // scroll (the drawing, the success ring) rises to the top as usual, then
        // stays there for that many screens of scrolling - the next section
        // waiting right below it, not over it - before that one slides over
        // it. The scrolling room is an empty spacer after it
        // (.bl-stack-hold; scrollThrough reads its progress there); the next
        // section is shifted up over the spacer (translate) so no gap shows.
        sections.forEach(function (s) {
            if (!s.hasAttribute('data-bl-hold')) return;
            var spacer = document.createElement('div');
            spacer.className = 'bl-stack-hold';
            spacer.setAttribute('aria-hidden', 'true');
            s.parentNode.insertBefore(spacer, s.nextSibling);
        });

        // A section's own background colour (transparent ones sit on navy),
        // or --bl-stack-tint where its edges show another colour (motion.less).
        function tintOf(s) {
            var cs = getComputedStyle(s);
            var m = (cs.getPropertyValue('--bl-stack-tint').trim() || cs.backgroundColor).match(/[\d.]+/g) || [];
            return m.length >= 3 && (m.length < 4 || +m[3] > 0) ? [+m[0], +m[1], +m[2]] : NAVY;
        }

        function layout() {
            var vh = window.innerHeight;
            sections.forEach(function (s, i) {
                s.style.zIndex = String(10 + i);
                var hold = parseFloat(s.getAttribute('data-bl-hold')) || 0;
                s.style.top = s.hasAttribute('data-bl-nostack') ? '' : Math.min(0, vh - s.offsetHeight) + 'px';
                if (hold && s.nextElementSibling && s.nextElementSibling.classList.contains('bl-stack-hold')) {
                    s.nextElementSibling.style.height = Math.round(hold * vh) + 'px';
                }
                var next = sections[i + 1];
                built[i] = next ? Math.max(0, -parseFloat(getComputedStyle(next).marginTop) || 0) : 0;
                tints[i] = tintOf(s);
            });
            update();
        }

        function update() {
            ticking = false;
            var vh = window.innerHeight;
            var covers = [];

            // Holds: the section after a held one waits right below it
            // (shifted up over the spacer) until the spacer has scrolled by.
            sections.forEach(function (s, i) {
                var next = sections[i + 1];
                if (!next || !s.hasAttribute('data-bl-hold')) return;
                var shift = parseFloat(next.getAttribute('data-bl-shift')) || 0;
                var natural = next.getBoundingClientRect().top - shift;
                var below = s.getBoundingClientRect().top + s.offsetHeight - built[i];
                shift = Math.min(0, Math.round(below - natural));
                next.setAttribute('data-bl-shift', shift);
                next.style.translate = shift ? '0 ' + shift + 'px' : '';
            });
            sections.forEach(function (s, i) {
                var next = sections[i + 1];
                var cover = 0;
                if (next) {
                    // How far the next section has slid over this one beyond
                    // the overlap built into the layout (its negative
                    // margin-top), so a short section whose follower is
                    // already on screen (the inner-page banner) is not dimmed
                    // on load. Measured from the unscaled height: the scale
                    // (motion.less) pulls the drawn bottom edge up.
                    var over = s.getBoundingClientRect().top + s.offsetHeight - next.getBoundingClientRect().top - built[i];
                    cover = Math.max(0, Math.min(1, over / Math.min(vh, s.offsetHeight)));
                }
                s.style.setProperty('--cover', cover.toFixed(3));
                covers[i] = cover;
                // The shrink (up to 3.5%, motion.less), rounded so the side
                // edges land on whole pixels: a part-pixel edge lets a
                // lighter hairline of the undimmed section show. The edge
                // sits 0.05px inside the pixel - just short of it, the
                // browser clips animated layers (the evidence photo) a whole
                // pixel wide of the section.
                var w = s.offsetWidth;
                var inset = Math.round(w * cover * 0.035 / 2);
                s.style.setProperty('--stack-scale', w && inset ? (1 - 2 * (inset + 0.05) / w).toFixed(7) : '1');
            });

            // A section buried under one that is itself being covered, and
            // whose top corners are off screen, can only show through that
            // one's side strips (the hero, which recedes toward its right
            // edge, would) - so it is clipped away (.is-buried, motion.less).
            sections.forEach(function (s, i) {
                var next = sections[i + 1];
                var buried = !!next && covers[i + 1] > 0 && next.getBoundingClientRect().top < 0;
                s.classList.toggle('is-buried', buried);
            });

            // A covered section shrinks a little (motion.less), which opens a
            // strip on each side of it. Behind each covered section's visible
            // band of the screen, the page is painted that section's colour,
            // darkened like its veil, so the strips blend into it instead of
            // showing as blank lines. Two can be covered at once (on phones),
            // hence bands of a gradient fixed to the screen. (The body only
            // spans the first screen, so it is painted too.)
            var stops = [];
            sections.forEach(function (s, i) {
                var next = sections[i + 1];
                if (!next || !covers[i] || s.hasAttribute('data-bl-nostack')) return;
                var from = Math.max(0, Math.round(s.getBoundingClientRect().top));
                var to = Math.min(vh, Math.round(next.getBoundingClientRect().top));
                if (to <= from) return;
                var a = covers[i] * 0.55;
                var c = 'rgb(' + tints[i].map(function (v, k) {
                    return Math.round(v * (1 - a) + NAVY[k] * a);
                }).join(',') + ')';
                // The first band reaches up to the top of the screen, and
                // each band runs on until the next one starts.
                stops.push(c + ' ' + (stops.length ? from : 0) + 'px');
                stops.push(c + ' ' + to + 'px');
            });
            var fill = '';
            if (stops.length) {
                // The last band runs on to the bottom of the screen.
                stops[stops.length - 1] = stops[stops.length - 1].replace(/ \d+px$/, ' 100%');
                fill = 'linear-gradient(' + stops.join(', ') + ') fixed';
            }
            [root, document.body].forEach(function (el) {
                el.style.background = fill;
            });
        }

        window.addEventListener('scroll', function () {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });

        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(layout, 120);
        });
        // Heights change as images and fonts load.
        window.addEventListener('load', layout);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
        layout();
    }

    /*
     * Homepage "What success looks like": four goals on a ring of 96 ticks
     * (partials/balansed/success-ring.htm, generated from the Figma arcs; each
     * tick has its clockwise order data-i and quarter data-q). The section is
     * as tall as its content (pages/home.less); the scroll through it
     * (scrollThrough) lights the ticks one by one - a quarter per goal, like a
     * loading indicator - while the goal text follows the quarter being
     * filled and each quarter's photo pops in once it is complete.
     * Scrolling simply carries on past it at any time.
     */
    function initSuccess() {
        var root = document.querySelector('[data-bl-success]');
        if (!root || !('IntersectionObserver' in window)) return;

        // -- Tuning -------------------------------------------------------
        var START = 0.33;    // start when the section top is at 33% of the screen (the ring and its text in view)
        var FINISH = 0.2;    // without the hold (reduced motion): all lit when it is at 20%
        var FILL = 0.78;     // share of each quarter's scroll spent filling (rest holds)
        var SMOOTH = 0.1;    // how fast the fill catches up with the scroll (0..1)
        // -----------------------------------------------------------------

        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var ticks = Array.prototype.slice.call(root.querySelectorAll('.bl-tick')).sort(function (a, b) {
            return a.getAttribute('data-i') - b.getAttribute('data-i');
        });
        var whats = Array.prototype.slice.call(root.querySelectorAll('.bl-success__what'));
        var thumbs = Array.prototype.slice.call(root.querySelectorAll('.bl-success__thumb'));
        var quarters = 4;
        var perQuarter = ticks.length / quarters;
        var current = 0, visible = false, raf = null, lastLit = -1, lastStep = -1;

        function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
        function ease(t) { return 1 - Math.pow(1 - t, 2); }

        function target() {
            return scrollThrough(root, START, FINISH);
        }

        function render(p) {
            var x = p * quarters;
            var q = Math.min(quarters - 1, Math.floor(x));
            var fill = ease(clamp((x - q) / FILL));
            var lit = Math.round(q * perQuarter + fill * perQuarter);
            if (p >= 1) lit = ticks.length;

            if (lit !== lastLit) {
                ticks.forEach(function (t, i) { t.classList.toggle('is-lit', i < lit); });
                lastLit = lit;
            }

            // The goal being filled; photos of completed quarters.
            var step = q;
            var done = Math.floor(lit / perQuarter);
            if (step !== lastStep) {
                whats.forEach(function (w, i) { w.classList.toggle('is-active', i === step); });
                lastStep = step;
            }
            thumbs.forEach(function (img) {
                var s = +img.getAttribute('data-step');
                var until = img.hasAttribute('data-until') ? +img.getAttribute('data-until') : Infinity;
                img.classList.toggle('is-on', done >= s + 1 && done - 1 <= until);
            });
        }

        function frame() {
            raf = null;
            var goal = target();
            current += (goal - current) * (reduce ? 1 : SMOOTH);
            if (Math.abs(goal - current) < 0.0005) current = goal;
            render(current);
            if (visible && current !== goal) raf = requestAnimationFrame(frame);
        }

        function kick() {
            if (!raf) raf = requestAnimationFrame(frame);
        }

        new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
            if (visible) kick();
        }).observe(root);
        window.addEventListener('scroll', function () { if (visible) kick(); }, { passive: true });

        current = target();
        render(current);
    }

    /*
     * Homepage partner logos: the pause button under the endless strip
     * (WCAG 2.2.2) toggles .is-paused, which holds the CSS loop
     * (pages/home.less). With "reduce motion" the strip is already still.
     */
    function initLogos() {
        var strip = document.querySelector('.bl-logos');
        var btn = document.querySelector('[data-bl-logos-pause]');
        if (!strip || !btn) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        btn.hidden = false;
        btn.addEventListener('click', function () {
            var paused = !strip.classList.contains('is-paused');
            strip.classList.toggle('is-paused', paused);
            btn.classList.toggle('is-paused', paused);
            btn.setAttribute('aria-label', paused ? 'Play partner logos' : 'Pause partner logos');
        });
    }

    /*
     * Homepage evidence slider: endless crossfade between the slides
     * (.is-current; the outgoing slide keeps .is-leaving while it fades so
     * its text stays visible). Advances every DELAY ms; the round arrow
     * shows the next slide and restarts the timer. Pauses while hovered or
     * focused, while off screen and when the tab is hidden, and for good
     * with its pause button; with "reduce motion" there is no autoplay
     * (the arrow still works).
     */
    function initSlider() {
        var root = document.querySelector('[data-bl-slider]');
        if (!root) return;
        var slides = Array.prototype.slice.call(root.querySelectorAll('.bl-evidence__slide'));
        if (slides.length < 2) return;

        // -- Tuning -------------------------------------------------------
        var DELAY = 7000;    // time each slide is shown (ms)
        var FADE = 1200;     // crossfade length (ms) - keep in step with home.less
        // -----------------------------------------------------------------

        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var current = 0, timer = null, hovered = false, focused = false, visible = false, paused = false;

        function show(next) {
            var prev = current;
            if (next === prev) return;
            current = (next + slides.length) % slides.length;
            slides[prev].classList.remove('is-current');
            slides[prev].classList.add('is-leaving');
            slides[prev].setAttribute('inert', '');
            setTimeout(function () { slides[prev].classList.remove('is-leaving'); }, FADE);
            slides[current].classList.add('is-current');
            slides[current].removeAttribute('inert');
        }

        function schedule() {
            clearTimeout(timer);
            timer = null;
            if (reduce || paused || hovered || focused || !visible || document.hidden) return;
            timer = setTimeout(function () {
                show(current + 1);
                schedule();
            }, DELAY);
        }

        root.querySelectorAll('[data-bl-slider-next]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                show(current + 1);
                // Keep keyboard focus on the arrow of the slide now shown.
                var nextBtn = slides[current].querySelector('[data-bl-slider-next]');
                if (nextBtn) nextBtn.focus({ preventScroll: true });
                schedule();
            });
        });

        // Pause button (WCAG 2.2.2): stops the automatic change until it is
        // pressed again. Not needed with "reduce motion" (never auto-advances).
        var pauseBtn = root.querySelector('[data-bl-slider-pause]');
        if (pauseBtn && !reduce) {
            pauseBtn.hidden = false;
            pauseBtn.addEventListener('click', function () {
                paused = !paused;
                pauseBtn.classList.toggle('is-paused', paused);
                pauseBtn.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
                schedule();
            });
        }

        root.addEventListener('mouseenter', function () { hovered = true; schedule(); });
        root.addEventListener('mouseleave', function () { hovered = false; schedule(); });
        root.addEventListener('focusin', function () { focused = true; schedule(); });
        root.addEventListener('focusout', function () {
            setTimeout(function () { focused = root.contains(document.activeElement); schedule(); }, 0);
        });
        document.addEventListener('visibilitychange', schedule);

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                visible = entries[0].isIntersecting;
                schedule();
            }, { threshold: 0.3 }).observe(root);
        } else {
            visible = true;
            schedule();
        }
    }

    /*
     * One-line drawings sketched as the visitor scrolls (the homepage
     * drawing effect, for drawings outside a pinned stage - e.g. the About
     * page's people and scales). Any <svg data-bl-draw> with .bl-line paths
     * (pathLength="1"): the pen runs through its paths in order, weighted by
     * length, from when its section comes into view (START) until the
     * section reaches its pinned position. Eased toward the scroll position
     * every frame (SMOOTH). "Reduce motion": drawn at once.
     *
     * data-bl-draw="view": timed to the drawing itself instead - from when
     * it enters the screen until its bottom is at 80% of it (or the page
     * can't scroll further). For a drawing at the bottom of a tall section.
     * data-bl-draw-focus="a,b": the part of the line between a and b (0..1
     * of its length) gets 80% of the scroll, so long straight lead-in and
     * lead-out strokes pass quickly and the figure itself is drawn slowly.
     */
    function initScrollDraw() {
        var svgs = Array.prototype.slice.call(document.querySelectorAll('svg[data-bl-draw]'));
        if (!svgs.length || !('IntersectionObserver' in window)) return;

        var START = 0.85;   // begin when the section top is at 85% of the screen
        var SMOOTH = 0.08;  // how fast the pen catches up with the scroll (0..1)
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        var items = svgs.map(function (svg) {
            var focus = (svg.getAttribute('data-bl-draw-focus') || '').split(',').map(parseFloat);
            var paths = Array.prototype.slice.call(svg.querySelectorAll('.bl-line'));
            var lengths = paths.map(function (p) { try { return p.getTotalLength(); } catch (e) { return 1; } });
            return {
                section: svg.closest('section') || svg.parentElement,
                paths: paths,
                lengths: lengths,
                total: lengths.reduce(function (a, b) { return a + b; }, 0) || 1,
                svg: svg,
                view: svg.getAttribute('data-bl-draw') === 'view',
                focus: focus.length === 2 && focus[0] < focus[1] ? focus : null,
                current: 0,
                visible: false,
            };
        });

        function draw(item, d) {
            var done = d * item.total;
            item.paths.forEach(function (p, i) {
                var k = Math.max(0, Math.min(1, done / item.lengths[i]));
                done -= item.lengths[i];
                p.style.strokeDashoffset = (1 - k).toFixed(4);
            });
        }

        // Scroll progress 0..1 -> share of the line drawn (see "focus").
        function shape(item, t) {
            if (!item.focus) return t;
            var a = item.focus[0], b = item.focus[1];
            if (t < 0.1) return t / 0.1 * a;
            if (t > 0.9) return b + (t - 0.9) / 0.1 * (1 - b);
            return a + (t - 0.1) / 0.8 * (b - a);
        }

        function target(item) {
            var vh = window.innerHeight;
            if (item.view) {
                var q = item.svg.getBoundingClientRect();
                var y = window.pageYOffset;
                var from = y + q.top - vh;                       // top enters
                var to = y + q.bottom - vh * 0.8;                // bottom at 80%
                to = Math.min(to, document.documentElement.scrollHeight - vh - 2);
                return to > from ? shape(item, Math.max(0, Math.min(1, (y - from) / (to - from)))) : 1;
            }
            var r = item.section.getBoundingClientRect();
            var end = Math.min(0, vh - r.height);       // where the section pins
            var span = vh * START - end;
            return span > 0 ? shape(item, Math.max(0, Math.min(1, (vh * START - r.top) / span))) : 1;
        }

        var raf = null;
        function frame() {
            raf = null;
            var again = false;
            items.forEach(function (item) {
                if (!item.visible) return;
                var goal = target(item);
                item.current += (goal - item.current) * (reduce ? 1 : SMOOTH);
                if (Math.abs(goal - item.current) < 0.0005) item.current = goal;
                else again = true;
                draw(item, item.current);
            });
            if (again) raf = requestAnimationFrame(frame);
        }
        function kick() { if (!raf) raf = requestAnimationFrame(frame); }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                items.forEach(function (item) {
                    if (item.section === entry.target) item.visible = entry.isIntersecting;
                });
            });
            kick();
        });
        items.forEach(function (item) {
            item.current = reduce ? 1 : target(item);
            draw(item, item.current);
            io.observe(item.section);
        });
        window.addEventListener('scroll', kick, { passive: true });
        window.addEventListener('resize', kick);
    }

    /*
     * About - "BALANSED will" cards: hovering a card opens its short text
     * (.is-open); opened cards stay open until the pointer leaves the list,
     * so moving across the cards reveals them one after another.
     */
    function initWill() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-bl-will]'), function (list) {
            var cards = Array.prototype.slice.call(list.querySelectorAll('.bl-will__card'));
            cards.forEach(function (card) {
                if (!card.querySelector('.bl-will__more')) return;
                card.addEventListener('mouseenter', function () { card.classList.add('is-open'); });
            });
            list.addEventListener('mouseleave', function () {
                cards.forEach(function (card) { card.classList.remove('is-open'); });
            });
        });
    }

    initDrawer();
    initSearch();
    initReveal();
    initStack();
    initConsortium();
    initRegions();
    initRegionEnter();
    initDrawing();
    initSuccess();
    initSlider();
    initLogos();
    initScrollDraw();
    initWill();
    initDialogs();
})();
