import { $, createElem } from './html_utils';

export default class ContextMenu {
    /*
	items: [{
		icon: 'icon class',
		label: 'menu opt 1',
		show: (event, item) => true,
		handle: (event, item) => {
			// this event is the one triggered the menu to show
		}
	}]
	*/
    constructor(items, container) {
        this.items = items || [];
        this.items.forEach((item, i) => {
            item._index = i;
            if (!item.show) {
                item.show = () => true;
            }
            if (!item.handle) {
                item.handle = () => {};
            }
        });
        this.container = container;

        this.draw();
        this.bind();
    }

    draw() {
        this.$menu = createElem('div', {
            append_to: this.container,
            class: 'menu-wrapper hide',
        });
        this.items.forEach((item) => {
            item.$elem = this.draw_item(item, this.$menu);
        });
    }

    draw_item(item, append_to) {
        const $item = createElem('div', {
            append_to,
            class: 'item',
            'data-i': item._index,
        });
        const icon_class = item.icon || '';
        const $icon = createElem('div', {
            append_to: $item,
            class: `icon ${icon_class}`,
        });
        $icon.innerText = '';
        const $label = createElem('span', {
            append_to: $item,
            class: 'label',
        });
        $label.innerText = item.label;
        return $item;
    }

    bind() {
        this.items.forEach((item) => {
            if (!item.$elem) {
                return;
            }
            $.bind(item.$elem, 'click', () => {
                item.handle(this.triggered_event, item);
                this.hide();
            });
        });

        document.addEventListener('click', (event) => {
            for (const elem of document.elementsFromPoint(
                event.clientX,
                event.clientY
            )) {
                if (elem && elem.matches && elem.matches('.menu-wrapper')) {
                    return;
                }
            }
            this.hide();
        });
    }

    show(event) {
        this.items.forEach((item) => {
            if (!item.$elem) {
                return;
            }
            if (item.show(event, item)) {
                item.$elem.classList.remove('hide');
            } else {
                item.$elem.classList.add('hide');
            }
        });
        this.triggered_event = event;

        this.$menu.style['z-index'] = '99999';
        this.$menu.style.left = event.offsetX + 'px';
        this.$menu.style.top = event.offsetY + 'px';
        this.$menu.classList.remove('hide');
    }

    hide() {
        this.$menu.classList.add('hide');
    }
}
