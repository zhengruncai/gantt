import { $, createSVG } from './html_utils';

export default class Arrow {
    constructor(opts) {
        const { gantt, from_task, to_task, end_x, end_y } = opts;
        this.gantt = gantt;
        this.from_task = from_task;

        if (to_task !== undefined && to_task !== null) {
            this.to_task = to_task;
        } else if (this.isValidOffset(end_x) && this.isValidOffset(end_y)) {
            this.end_x = end_x;
            this.end_y = end_y;
        } else {
            throw new Error('either to_task or end x/y is required');
        }
        this.update_arrow_id();
        this.calculate_path();
        this.draw();
        this.bind();
    }

    static create_with_to_task(gantt, from_task, to_task) {
        return new Arrow({
            gantt,
            from_task,
            to_task,
        });
    }

    static create_with_end_xy(gantt, from_task, end_x, end_y) {
        return new Arrow({
            gantt,
            from_task,
            end_x,
            end_y,
        });
    }

    isValidOffset(offset) {
        return offset !== undefined && offset !== null && !isNaN(+offset);
    }

    update_arrow_id() {
        if (this.to_task) {
            this.id = this.from_task.task.id + ',' + this.to_task.task.id;
        } else {
            this.id =
                this.from_task.task.id + ',,' + this.end_x + ',' + this.end_y;
        }
    }

    update_to_task(to_task) {
        if (!to_task) {
            throw new Error('invalid to_task');
        }
        this.to_task = to_task;
        this.end_x = undefined;
        this.end_y = undefined;
        this.group.setAttribute('data-to', to_task.task.id);
        this.update_arrow_id();
        this.update();
    }

    update_end_xy(end_x, end_y) {
        if (!this.isValidOffset(end_x) || !this.isValidOffset(end_y)) {
            throw new Error('invalid end x/y');
        }
        this.to_task = undefined;
        this.end_x = end_x;
        this.end_y = end_y;
        this.group.removeAttribute('data-to');
        this.update_arrow_id();
        this.update();
    }

    calculate_path() {
        let start_x =
            this.from_task.$bar.getX() + this.from_task.$bar.getWidth() / 2;
        const start_y =
            this.from_task.$bar.getY() + this.from_task.$bar.getHeight();

        const end_x = this.to_task
            ? this.to_task.$bar.getX() - this.gantt.options.padding / 2
            : this.end_x;
        const end_y = this.to_task
            ? this.to_task.$bar.getY() + this.to_task.$bar.getHeight() / 2
            : this.end_y;

        const condition = () =>
            end_x < start_x + this.gantt.options.padding &&
            start_x > this.from_task.$bar.getX() + this.gantt.options.padding;

        while (condition()) {
            start_x -= 10;
        }

        const from_is_below_to = start_y > end_y;
        const curve = this.gantt.options.arrow_curve;
        const clockwise = from_is_below_to ? 1 : 0;
        const curve_y = from_is_below_to ? -curve : curve;
        const offset = from_is_below_to
            ? end_y + this.gantt.options.arrow_curve
            : end_y - this.gantt.options.arrow_curve;

        this.path = `
            M ${start_x} ${start_y}
            V ${offset}
            a ${curve} ${curve} 0 0 ${clockwise} ${curve} ${curve_y}
            L ${end_x} ${end_y}
            m -5 -5
            l 5 5
            l -5 5`;

        if (end_x < this.from_task.$bar.getX() + this.gantt.options.padding) {
            const down_1 = this.gantt.options.padding / 2 - curve;
            const down_2 = end_y - curve_y;
            const left = end_x - this.gantt.options.padding;

            this.path = `
                M ${start_x} ${start_y}
                v ${down_1}
                a ${curve} ${curve} 0 0 1 -${curve} ${curve}
                H ${left}
                a ${curve} ${curve} 0 0 ${clockwise} -${curve} ${curve_y}
                V ${down_2}
                a ${curve} ${curve} 0 0 ${clockwise} ${curve} ${curve_y}
                L ${end_x} ${end_y}
                m -5 -5
                l 5 5
                l -5 5`;
        }
        return {
            path: this.path,
            start_x,
            start_y,
            end_x,
            end_y,
        };
    }

    draw() {
        this.group = createSVG('g', {
            class: 'arrow-wrapper',
            'data-from': this.from_task.task.id,
        });
        if (this.to_task) {
            this.group.setAttribute('data-to', this.to_task.task.id);
        }
        this.element = createSVG('path', {
            class: 'arrow-path',
            d: this.path,
            append_to: this.group,
        });
    }

    draw_end_circle(cx, cy) {
        if (!this.end_circle) {
            this.end_circle = createSVG('g', {
                class: 'end-circle-group',
                append_to: this.group,
            });
            this.end_circle_outer = createSVG('circle', {
                class: 'end-circle-outer',
                cx,
                cy,
                r: this.gantt.options.bar_height / 2,
                append_to: this.end_circle,
            });
            this.end_circle_inner = createSVG('circle', {
                class: 'end-circle-inner',
                cx,
                cy,
                r: 2,
                append_to: this.end_circle,
            });
        } else {
            this.end_circle_outer.setAttribute('cx', cx);
            this.end_circle_outer.setAttribute('cy', cy);
            this.end_circle_inner.setAttribute('cx', cx);
            this.end_circle_inner.setAttribute('cy', cy);
        }
    }

    remove_end_circle() {
        if (this.end_circle) {
            this.end_circle.remove();
            this.end_circle = null;
        }
    }

    bind() {
        this.setup_active_event();
    }

    setup_active_event() {
        $.on(this.group, 'focus click', (e) => {
            this.gantt.unselect_all();
            this.group.classList.add('active');
        });
    }

    update() {
        const { end_x, end_y } = this.calculate_path();
        if (this.to_task && this.group.classList.contains('connecting')) {
            this.draw_end_circle(end_x, end_y);
        } else {
            this.remove_end_circle();
        }
        this.element.setAttribute('d', this.path);
    }
}
