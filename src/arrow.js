import { $, createSVG } from './svg_utils';

export default class Arrow {
    constructor(gantt, from_task, to_task) {
        this.id = from_task.task.id + ',' + to_task.task.id;
        this.gantt = gantt;
        this.from_task = from_task;
        this.to_task = to_task;

        this.calculate_path();
        this.draw();
        this.bind();
    }

    calculate_path() {
        let start_x =
            this.from_task.$bar.getX() + this.from_task.$bar.getWidth() / 2;

        const condition = () =>
            this.to_task.$bar.getX() < start_x + this.gantt.options.padding &&
            start_x > this.from_task.$bar.getX() + this.gantt.options.padding;

        while (condition()) {
            start_x -= 10;
        }

        const start_y =
            this.from_task.$bar.getY() + this.gantt.options.bar_height;

        const end_x = this.to_task.$bar.getX() - this.gantt.options.padding / 2;
        const end_y =
            this.to_task.$bar.getY() + this.gantt.options.bar_height / 2;

        const from_is_below_to =
            this.from_task.$bar.getY() > this.to_task.$bar.getY();
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

        if (
            this.to_task.$bar.getX() <
            this.from_task.$bar.getX() + this.gantt.options.padding
        ) {
            const down_1 = this.gantt.options.padding / 2 - curve;
            const down_2 =
                this.to_task.$bar.getY() +
                this.to_task.$bar.getHeight() / 2 -
                curve_y;
            const left = this.to_task.$bar.getX() - this.gantt.options.padding;

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
    }

    draw() {
        this.group = createSVG('g', {
            class: 'arrow-wrapper',
            'data-from': this.from_task.task.id,
            'data-to': this.to_task.task.id,
        });
        this.element = createSVG('path', {
            class: 'arrow-path',
            d: this.path,
            append_to: this.group,
        });
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
        this.calculate_path();
        this.element.setAttribute('d', this.path);
    }
}
