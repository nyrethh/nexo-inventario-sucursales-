/* Selects existing motorcycles. Values submitted to the API come from the selected results. */
globalThis.NexoSerialPicker = {
    mount(container, { units, productName, onChange, limit = 100 }) {
        const controller = new AbortController();
        const listen = (element, event, listener) => element.addEventListener(event, listener, { signal: controller.signal });
        const selected = new Map();
        const id = 'serial-options-' + crypto.randomUUID();
        let matches = [];
        let focused = -1;

        container.innerHTML = `
            <div class="serial-picker">
                <label for="${id}-search">Buscar moto por serial, modelo o código</label>
                <input id="${id}-search" type="search" role="combobox" aria-autocomplete="list"
                    aria-expanded="false" aria-controls="${id}" autocomplete="off" maxlength="160"
                    placeholder="Escribe parte del serial…">
                <div id="${id}" class="serial-results" role="listbox" aria-label="Motos disponibles" hidden></div>
                <p class="caption serial-feedback" role="status" aria-live="polite"></p>
                <ul class="serial-selected" aria-label="Motos seleccionadas"></ul>
            </div>`;
        const input = container.querySelector('input');
        const results = container.querySelector('[role=listbox]');
        const feedback = container.querySelector('[role=status]');
        const list = container.querySelector('.serial-selected');
        const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

        function closeResults() {
            results.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            focused = -1;
        }

        function highlight(index) {
            focused = index;
            Array.from(results.children).forEach((option, position) => {
                option.setAttribute('aria-selected', String(position === index));
            });
            const option = results.children[index];
            if (option) {
                input.setAttribute('aria-activedescendant', option.id);
                option.scrollIntoView({ block: 'nearest' });
            }
        }

        function renderResults() {
            const query = normalize(input.value);
            focused = -1;
            input.removeAttribute('aria-activedescendant');
            results.replaceChildren();
            if (!query) {
                closeResults();
                feedback.textContent = selected.size
                    ? selected.size + ' moto(s) seleccionada(s).'
                    : 'Escribe para buscar motos disponibles en el origen seleccionado.';
                return;
            }
            if (selected.size >= limit) {
                closeResults();
                feedback.textContent = 'Puedes seleccionar hasta ' + limit + ' motos por movimiento.';
                return;
            }
            const terms = query.split(/\s+/);
            matches = units.filter(unit => unit.serial && !selected.has(unit.serial)
                && terms.every(term => normalize(unit.serial + ' ' + unit.code + ' ' + productName(unit.code)).includes(term)));
            matches.slice(0, 30).forEach((unit, index) => {
                const option = document.createElement('button');
                option.type = 'button';
                option.id = id + '-' + index;
                option.className = 'serial-result';
                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', 'false');
                option.tabIndex = -1;
                const serial = document.createElement('strong');
                serial.textContent = unit.serial;
                const model = document.createElement('span');
                model.textContent = productName(unit.code) + ' · ' + unit.code;
                option.append(serial, model);
                option.addEventListener('mousedown', event => event.preventDefault());
                option.addEventListener('click', () => selectUnit(unit));
                results.append(option);
            });
            results.hidden = matches.length === 0;
            input.setAttribute('aria-expanded', String(matches.length > 0));
            feedback.textContent = matches.length
                ? matches.length + ' coincidencia(s).' + (matches.length > 30 ? ' Se muestran 30; escribe más para filtrar.' : '')
                : 'No hay motos disponibles con esa búsqueda en este origen.';
        }

        function renderSelected() {
            list.replaceChildren();
            for (const unit of selected.values()) {
                const item = document.createElement('li');
                const label = document.createElement('span');
                label.textContent = unit.serial;
                const value = document.createElement('input');
                value.type = 'hidden';
                value.name = 'serials';
                value.value = unit.serial;
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'serial-remove';
                remove.textContent = 'Quitar';
                remove.setAttribute('aria-label', 'Quitar moto ' + unit.serial);
                remove.addEventListener('click', () => {
                    selected.delete(unit.serial);
                    renderSelected();
                    renderResults();
                    input.focus();
                });
                item.append(label, value, remove);
                list.append(item);
            }
            onChange(Array.from(selected.keys()));
        }

        function selectUnit(unit) {
            if (selected.size >= limit || selected.has(unit.serial)) return;
            selected.set(unit.serial, unit);
            input.value = '';
            renderSelected();
            renderResults();
            input.focus();
        }

        listen(input, 'input', renderResults);
        listen(input, 'focus', renderResults);
        listen(input, 'keydown', event => {
            if (event.key === 'Escape' && !results.hidden) {
                event.preventDefault();
                event.stopPropagation();
                closeResults();
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (results.hidden) renderResults();
                const count = results.children.length;
                if (!count) return;
                const next = event.key === 'ArrowDown'
                    ? (focused + 1) % count : (focused <= 0 ? count - 1 : focused - 1);
                highlight(next);
            } else if (event.key === 'Enter' && !results.hidden && focused >= 0) {
                event.preventDefault();
                selectUnit(matches[focused]);
            } else if (event.key === 'Enter' && input.value.trim()) {
                event.preventDefault();
                feedback.textContent = 'Selecciona una moto de los resultados para añadirla.';
            } else if (event.key === 'Tab') {
                closeResults();
            }
        });
        listen(document, 'click', event => {
            if (!container.contains(event.target)) closeResults();
        });
        renderSelected();
        renderResults();
        return {
            destroy() { controller.abort(); container.replaceChildren(); },
            get serials() { return Array.from(selected.keys()); }
        };
    }
};
