import { createElem, encodeHTML } from './html_utils';

export default class Tips {
    constructor() {
        this.make();
    }

    make() {
        this.$group = createElem('div', {
            class: 'tips-wrapper',
            append_to: document.body,
        });
        this.$content = createElem('div', {
            class: 'content',
            append_to: this.$group,
        });
        this.$pointer = createElem('div', {
            class: 'pointer',
            append_to: this.$group,
        });
    }

    show(content, anchor) {
        if (!anchor) {
            return;
        }
        this.$content.innerHTML = encodeHTML(content);
        this.$group.classList.add('show');

        const is_body_static =
            getComputedStyle(document.body).position === 'static';
        const body_pos_meta = document.body.getBoundingClientRect();
        const anchor_pos_meta = anchor.getBoundingClientRect();
        const my_pos_meta = this.$content.getBoundingClientRect();
        this.$group.style.left =
            anchor_pos_meta.x -
            (is_body_static ? 0 : body_pos_meta.x) +
            (anchor_pos_meta.width - my_pos_meta.width) / 2 +
            'px';
        this.$group.style.top =
            anchor_pos_meta.y -
            (is_body_static ? 0 : body_pos_meta.y) -
            my_pos_meta.height -
            8 +
            'px';

        this.$pointer.style.left = (my_pos_meta.width - 10) / 2 + 'px';
    }

    hide() {
        this.$group.classList.remove('show');
    }
}
