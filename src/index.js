import date_utils from './date_utils';
import { $, createSVG } from './html_utils';
import Bar from './bar';
import Arrow from './arrow';
import Popup from './popup';
import Tips from './tips';
import ContextMenu from './contextmenu';

import './gantt.scss';

const VIEW_MODE = {
    QUARTER_DAY: 'Quarter Day',
    HALF_DAY: 'Half Day',
    DAY: 'Day',
    WEEK: 'Week',
    MONTH: 'Month',
    YEAR: 'Year',
};

export default class Gantt {
    constructor(wrapper, tasks, options) {
        this.setup_wrapper(wrapper);
        this.setup_options(options);
        this.setup_tasks(tasks);
        // initialize with default view mode
        this.change_view_mode();
        this.bind_events();
    }

    setup_wrapper(element) {
        let svg_element, wrapper_element;

        // CSS Selector is passed
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }

        // get the SVGElement
        if (element instanceof HTMLElement) {
            wrapper_element = element;
            svg_element = element.querySelector('svg');
        } else if (element instanceof SVGElement) {
            svg_element = element;
        } else {
            throw new TypeError(
                'Frappé Gantt only supports usage of a string CSS selector,' +
                    " HTML DOM element or SVG DOM element for the 'element' parameter"
            );
        }

        // svg element
        if (!svg_element) {
            // create it
            this.$svg = createSVG('svg', {
                append_to: wrapper_element,
                class: 'gantt',
            });
        } else {
            this.$svg = svg_element;
            this.$svg.classList.add('gantt');
        }

        // wrapper element
        this.$container = document.createElement('div');
        this.$container.classList.add('gantt-container');

        const parent_element = this.$svg.parentElement;
        parent_element.appendChild(this.$container);
        this.$container.appendChild(this.$svg);

        // popup wrapper
        this.popup_wrapper = document.createElement('div');
        this.popup_wrapper.classList.add('popup-wrapper');
        this.$container.appendChild(this.popup_wrapper);
    }

    setup_options(options) {
        const default_options = {
            header_height: 50,
            column_width: 30,
            step: 24,
            view_modes: [...Object.values(VIEW_MODE)],
            bar_height: 20,
            bar_corner_radius: 3,
            arrow_curve: 5,
            padding: 18,
            view_mode: 'Day',
            date_format: 'YYYY-MM-DD',
            popup_trigger: 'click',
            custom_popup_html: null,
            language: 'en',
            sortable: false,
            drag_enabled: true,
        };
        this.options = Object.assign({}, default_options, options);

        this.setup_special_days(options.special_days);
    }

    setup_special_days(special_days) {
        if (!special_days) {
            special_days = [];
        }
        this.options.special_days = {};
        for (const sd of special_days) {
            this.options.special_days[sd.date.getTime()] = sd;
        }
    }

    setup_tasks(tasks) {
        // prepare tasks
        this.tasks = tasks.map((task, i) => {
            // convert to Date objects
            task._start = date_utils.parse(task.start);
            task._end = date_utils.parse(task.end);

            // make task invalid if duration too large
            if (date_utils.diff(task._end, task._start, 'year') > 10) {
                task.end = null;
            }

            // cache index
            task._index = i;

            // invalid dates
            if (!task.start && !task.end) {
                const today = date_utils.today();
                task._start = today;
                task._end = date_utils.add(today, 2, 'day');
            }

            if (!task.start && task.end) {
                task._start = date_utils.add(task._end, -2, 'day');
            }

            if (task.start && !task.end) {
                task._end = date_utils.add(task._start, 2, 'day');
            }

            // if hours is not set, assume the last day is full day
            // e.g: 2018-09-09 becomes 2018-09-09 23:59:59
            const task_end_values = date_utils.get_date_values(task._end);
            if (task_end_values.slice(3).every((d) => d === 0)) {
                task._end = date_utils.add(task._end, 24, 'hour');
            }

            // invalid flag
            if (!task.start || !task.end) {
                task.invalid = true;
            }

            // dependencies
            if (typeof task.dependencies === 'string' || !task.dependencies) {
                let deps = [];
                if (task.dependencies) {
                    deps = task.dependencies
                        .split(',')
                        .map((d) => d.trim())
                        .filter((d) => d);
                }
                task.dependencies = deps;
            }

            // uids
            if (!task.id) {
                task.id = generate_id(task);
            }

            // show label
            if (typeof task.show_label === 'undefined') {
                task.show_label = true;
            }

            return task;
        });

        this.setup_dependencies();
    }

    setup_dependencies() {
        this.dependency_map = {};
        for (let t of this.tasks) {
            for (let d of t.dependencies) {
                this.dependency_map[d] = this.dependency_map[d] || [];
                this.dependency_map[d].push(t.id);
            }
        }
    }

    refresh(tasks) {
        this.setup_tasks(tasks);
        this.change_view_mode();
    }

    refresh_arrows() {
        this.layers.arrow.innerHTML = '';
        this.setup_dependencies();
        this.make_arrows();
        this.map_arrows_on_bars();
    }

    change_view_mode(mode = this.options.view_mode) {
        this.update_view_scale(mode);
        this.setup_dates();
        this.render();
        this.set_scroll_position();
        // fire viewmode_change event
        this.trigger_event('view_change', [mode]);
    }

    update_view_scale(view_mode) {
        this.options.view_mode = view_mode;

        if (view_mode === VIEW_MODE.DAY) {
            this.options.step = 24;
            this.options.column_width = 50;
        } else if (view_mode === VIEW_MODE.HALF_DAY) {
            this.options.step = 24 / 2;
            this.options.column_width = 50;
        } else if (view_mode === VIEW_MODE.QUARTER_DAY) {
            this.options.step = 24 / 4;
            this.options.column_width = 50;
        } else if (view_mode === VIEW_MODE.WEEK) {
            this.options.step = 24 * 7;
            this.options.column_width = 150;
        } else if (view_mode === VIEW_MODE.MONTH) {
            this.options.step = 24 * 30;
            this.options.column_width = 150;
        } else if (view_mode === VIEW_MODE.YEAR) {
            this.options.step = 24 * 365;
            this.options.column_width = 150;
        }
    }

    setup_dates() {
        this.setup_gantt_dates();
        this.setup_date_values();
    }

    setup_gantt_dates() {
        this.gantt_start = this.gantt_end = null;

        for (let task of this.tasks) {
            // set global start and end date
            if (!this.gantt_start || task._start < this.gantt_start) {
                this.gantt_start = task._start;
            }
            if (!this.gantt_end || task._end > this.gantt_end) {
                this.gantt_end = task._end;
            }
        }

        this.gantt_start = date_utils.start_of(this.gantt_start, 'day');
        this.gantt_end = date_utils.start_of(this.gantt_end, 'day');

        // add date padding on both sides
        if (this.view_is([VIEW_MODE.QUARTER_DAY, VIEW_MODE.HALF_DAY])) {
            this.gantt_start = date_utils.add(this.gantt_start, -7, 'day');
            this.gantt_end = date_utils.add(this.gantt_end, 7, 'day');
        } else if (this.view_is(VIEW_MODE.MONTH)) {
            this.gantt_start = date_utils.start_of(this.gantt_start, 'year');
            this.gantt_end = date_utils.add(this.gantt_end, 1, 'year');
        } else if (this.view_is(VIEW_MODE.YEAR)) {
            this.gantt_start = date_utils.add(this.gantt_start, -2, 'year');
            this.gantt_end = date_utils.add(this.gantt_end, 2, 'year');
        } else {
            this.gantt_start = date_utils.add(this.gantt_start, -1, 'month');
            this.gantt_end = date_utils.add(this.gantt_end, 1, 'month');
        }
    }

    setup_date_values() {
        this.dates = [];
        let cur_date = null;

        while (cur_date === null || cur_date < this.gantt_end) {
            if (!cur_date) {
                cur_date = date_utils.clone(this.gantt_start);
            } else {
                if (this.view_is(VIEW_MODE.YEAR)) {
                    cur_date = date_utils.add(cur_date, 1, 'year');
                } else if (this.view_is(VIEW_MODE.MONTH)) {
                    cur_date = date_utils.add(cur_date, 1, 'month');
                } else {
                    cur_date = date_utils.add(
                        cur_date,
                        this.options.step,
                        'hour'
                    );
                }
            }
            this.dates.push(cur_date);
        }
    }

    bind_events() {
        this.bind_contextmenu();
        this.bind_grid_click();
        this.bind_bar_events();
        this.bind_arrow_events();
        this.bind_date_events();
    }

    render() {
        this.clear();
        this.setup_layers();
        this.make_grid();
        this.make_dates();
        this.make_bars();
        this.make_arrows();
        this.map_arrows_on_bars();
        this.set_width();
    }

    setup_layers() {
        this.layers = {};
        const layers = ['grid', 'date', 'arrow', 'bar'];
        // make group layers
        for (let layer of layers) {
            this.layers[layer] = createSVG('g', {
                class: layer,
                append_to: this.$svg,
            });
        }
    }

    make_grid() {
        this.make_grid_background();
        this.make_grid_rows();
        this.make_grid_header();
        this.make_grid_ticks();
        this.make_grid_days();
    }

    make_grid_background() {
        const grid_width = this.dates.length * this.options.column_width;
        const grid_height =
            this.options.header_height +
            this.options.padding +
            (this.options.bar_height + this.options.padding) *
                this.tasks.length;

        createSVG('rect', {
            x: 0,
            y: 0,
            width: grid_width,
            height: grid_height,
            class: 'grid-background',
            append_to: this.layers.grid,
        });

        $.attr(this.$svg, {
            height: grid_height + this.options.padding + 100,
            width: '100%',
        });
    }

    make_grid_rows() {
        const rows_layer = createSVG('g', { append_to: this.layers.grid });
        const lines_layer = createSVG('g', { append_to: this.layers.grid });

        const row_width = this.dates.length * this.options.column_width;
        const row_height = this.options.bar_height + this.options.padding;

        let row_y = this.options.header_height + this.options.padding / 2;

        for (let task of this.tasks) {
            createSVG('rect', {
                x: 0,
                y: row_y,
                width: row_width,
                height: row_height,
                class: 'grid-row',
                append_to: rows_layer,
            });

            createSVG('line', {
                x1: 0,
                y1: row_y + row_height,
                x2: row_width,
                y2: row_y + row_height,
                class: 'row-line',
                append_to: lines_layer,
            });

            row_y += this.options.bar_height + this.options.padding;
        }
    }

    make_grid_header() {
        const header_width = this.dates.length * this.options.column_width;
        const header_height = this.options.header_height + 10;
        createSVG('rect', {
            x: 0,
            y: 0,
            width: header_width,
            height: header_height,
            class: 'grid-header',
            append_to: this.layers.grid,
        });
    }

    make_grid_ticks() {
        let tick_x = 0;
        let tick_y = this.options.header_height + this.options.padding / 2;
        let tick_height =
            (this.options.bar_height + this.options.padding) *
            this.tasks.length;

        for (let date of this.dates) {
            let tick_class = 'tick';
            // thick tick for monday
            if (this.view_is(VIEW_MODE.DAY) && date.getDate() === 1) {
                tick_class += ' thick';
            }
            // thick tick for first week
            if (
                this.view_is(VIEW_MODE.WEEK) &&
                date.getDate() >= 1 &&
                date.getDate() < 8
            ) {
                tick_class += ' thick';
            }
            // thick ticks for quarters
            if (this.view_is(VIEW_MODE.MONTH) && date.getMonth() % 3 === 0) {
                tick_class += ' thick';
            }

            createSVG('path', {
                d: `M ${tick_x} ${tick_y} v ${tick_height}`,
                class: tick_class,
                append_to: this.layers.grid,
            });

            if (this.view_is(VIEW_MODE.MONTH)) {
                tick_x +=
                    (date_utils.get_days_in_month(date) *
                        this.options.column_width) /
                    30;
            } else {
                tick_x += this.options.column_width;
            }
        }
    }

    make_grid_days() {
        if (!this.view_is(VIEW_MODE.DAY)) {
            return;
        }
        const today = date_utils.today();
        for (let date of this.dates) {
            const is_today = date_utils.diff(date, today, 'hour') === 0;
            const is_weekend = date.getDay() === 0 || date.getDay() === 6;
            const special_day = this.options.special_days[date.getTime()];
            if (!is_weekend && !is_today && !special_day) {
                continue;
            }
            const x =
                (date_utils.diff(date, this.gantt_start, 'hour') /
                    this.options.step) *
                this.options.column_width;
            const y = this.options.header_height / 2 + this.options.padding / 2;
            const width = this.options.column_width;
            const height =
                (this.options.bar_height + this.options.padding) *
                    this.tasks.length +
                this.options.header_height / 2;

            let grid_class = '';
            if (is_today) {
                grid_class = 'today-highlight';
            } else if (special_day && special_day.is_holiday) {
                grid_class = 'holiday';
            } else if (is_weekend && !special_day) {
                grid_class = 'holiday';
            } else if (is_weekend && special_day.is_holiday === 0) {
                grid_class = 'holiday work';
            }
            if (grid_class) {
                createSVG('rect', {
                    x,
                    y,
                    width,
                    height,
                    class: 'grid-day ' + grid_class,
                    append_to: this.layers.grid,
                });
            }
        }
    }

    make_dates() {
        for (let date of this.get_dates_to_draw()) {
            const special_day = this.options.special_days[date.date.getTime()];
            const lower_text = special_day
                ? date.lower_text + '*'
                : date.lower_text;
            createSVG('text', {
                x: date.lower_x,
                y: date.lower_y,
                innerHTML: lower_text,
                class: 'lower-text',
                'data-ts': date.date.getTime(),
                append_to: this.layers.date,
            });

            if (date.upper_text) {
                // draw thick header tick
                const tick_x = date.base_pos_x;
                const tick_y = 0;
                const tick_height =
                    this.options.header_height + this.options.padding / 2;
                createSVG('path', {
                    d: `M ${tick_x} ${tick_y} v ${tick_height}`,
                    class: 'tick thick',
                    append_to: this.layers.grid,
                });

                // draw upper text
                const $upper_text = createSVG('text', {
                    x: date.upper_x,
                    y: date.upper_y,
                    innerHTML: date.upper_text,
                    class: 'upper-text',
                    append_to: this.layers.date,
                });

                // remove out-of-bound dates
                if (
                    $upper_text.getBBox().x2 > this.layers.grid.getBBox().width
                ) {
                    $upper_text.remove();
                }
            }
        }
    }

    get_dates_to_draw() {
        let last_date_info = null;
        const dates = this.dates.map((date) => {
            const d = this.get_date_info(date, last_date_info);
            last_date_info = d;
            return d;
        });
        return dates;
    }

    get_date_info(date, last_date_info) {
        let last_date = null;
        if (last_date_info) {
            last_date = last_date_info.date;
        } else {
            // make sure
            // 1. not the same date of month
            // 2. not the same month
            // 3. diff larger than 1 upper text period
            last_date = date_utils.add(date, -400, 'day');
        }
        const month_upper_x_adj =
            (date_utils.diff(date, date_utils.start_of(date, 'month'), 'hour') *
                this.options.column_width) /
            this.options.step;
        const year_upper_x_adj =
            (date_utils.diff(date, date_utils.start_of(date, 'year'), 'hour') *
                this.options.column_width) /
            this.options.step;
        const date_text = {
            'Quarter Day_lower': date_utils.format(
                date,
                'HH',
                this.options.language
            ),
            'Half Day_lower': date_utils.format(
                date,
                'HH',
                this.options.language
            ),
            Day_lower:
                date.getDate() !== last_date.getDate()
                    ? date_utils.format(date, 'D ddd', this.options.language)
                    : '',
            Week_lower:
                date.getMonth() !== last_date.getMonth()
                    ? date_utils.format(date, 'D MMM', this.options.language)
                    : date_utils.format(date, 'D', this.options.language),
            Month_lower: date_utils.format(date, 'MMMM', this.options.language),
            Year_lower: date_utils.format(date, 'YYYY', this.options.language),
            'Quarter Day_upper':
                date.getDate() !== last_date.getDate()
                    ? date_utils.format(date, 'D MMM', this.options.language)
                    : '',
            'Half Day_upper':
                date.getDate() !== last_date.getDate()
                    ? date.getMonth() !== last_date.getMonth()
                        ? date_utils.format(
                              date,
                              'D MMM',
                              this.options.language
                          )
                        : date_utils.format(date, 'D', this.options.language)
                    : '',
            Day_upper:
                date.getMonth() !== last_date.getMonth()
                    ? date_utils.format(
                          date,
                          'YYYY MMMM',
                          this.options.language
                      )
                    : '',
            Week_upper:
                date.getMonth() !== last_date.getMonth()
                    ? date_utils.format(date, 'MMMM', this.options.language)
                    : '',
            Month_upper:
                date.getFullYear() !== last_date.getFullYear()
                    ? date_utils.format(date, 'YYYY', this.options.language)
                    : '',
            Year_upper: '', // 'Year' Mode does not need upper text
        };

        let column_width = this.options.column_width;
        if (this.view_is(VIEW_MODE.MONTH)) {
            column_width =
                (date_utils.get_days_in_month(date) * column_width) / 30;
        }

        const base_pos = {
            x: last_date_info
                ? last_date_info.base_pos_x + last_date_info.column_width
                : 0,
            lower_y: this.options.header_height,
            upper_y: this.options.header_height - 25,
        };

        const x_pos = {
            'Quarter Day_lower': 0,
            'Quarter Day_upper': (column_width * 4) / 2,
            'Half Day_lower': 0,
            'Half Day_upper': (column_width * 2) / 2,
            Day_lower: column_width / 2,
            Day_upper: (column_width * 30) / 2 - month_upper_x_adj,
            Week_lower: 0,
            Week_upper: (column_width * 4) / 2 - month_upper_x_adj,
            Month_lower: column_width / 2,
            Month_upper: (column_width * 12) / 2 - year_upper_x_adj,
            Year_lower: column_width / 2,
            Year_upper: column_width / 2,
        };

        return {
            date,
            column_width,
            base_pos_x: base_pos.x,
            upper_text: date_text[`${this.options.view_mode}_upper`],
            lower_text: date_text[`${this.options.view_mode}_lower`],
            upper_x: base_pos.x + x_pos[`${this.options.view_mode}_upper`],
            upper_y: base_pos.upper_y,
            lower_x: base_pos.x + x_pos[`${this.options.view_mode}_lower`],
            lower_y: base_pos.lower_y,
        };
    }

    make_bars() {
        this.bars = this.tasks.map((task) => {
            const bar = new Bar(this, task);
            this.layers.bar.appendChild(bar.group);
            return bar;
        });
    }

    make_arrows() {
        this.arrows = [];
        for (let task of this.tasks) {
            let arrows = [];
            arrows = task.dependencies
                .map((task_id) => {
                    const dependency = this.get_task(task_id);
                    if (!dependency) return;
                    const arrow = Arrow.create_with_to_task(
                        this,
                        this.bars[dependency._index], // from_task
                        this.bars[task._index] // to_task
                    );
                    this.layers.arrow.appendChild(arrow.group);
                    return arrow;
                })
                .filter(Boolean); // filter falsy values
            this.arrows = this.arrows.concat(arrows);
        }
    }

    map_arrows_on_bars() {
        for (let bar of this.bars) {
            bar.arrows = this.arrows.filter((arrow) => {
                return (
                    arrow.from_task.task.id === bar.task.id ||
                    arrow.to_task.task.id === bar.task.id
                );
            });
        }
    }

    re_render() {
        const old_gantt_start = this.gantt_start;
        const old_scrollLeft = this.$svg.parentElement.scrollLeft;

        this.setup_dates();
        this.render();

        const new_gantt_start = this.gantt_start;
        const hour_diff = date_utils.diff(
            old_gantt_start,
            new_gantt_start,
            'hour'
        );
        const scroll_diff =
            (hour_diff / this.options.step) * this.options.column_width;

        this.$svg.parentElement.scrollLeft = old_scrollLeft + scroll_diff;
    }

    remove_active_bars() {
        this.hide_popup();
        document.querySelectorAll('.bar-wrapper.active').forEach((bar) => {
            this.remove_bar(bar);
        });
    }

    remove_bar(bar) {
        const task_id = bar.getAttribute('data-id');
        // console.log('removing bar. id=%s', task_id);
        const tasks = [];
        let idx = 0;
        this.tasks.forEach((task) => {
            if (task.id === task_id) {
                return;
            }
            tasks.push(task);
            task._index = idx++;
            task.dependencies = task.dependencies.filter(
                (id) => id !== task_id
            );
        });
        this.tasks = tasks;
        this.setup_dependencies();
        this.re_render();
    }

    remove_active_arrows() {
        document.querySelectorAll('.arrow-wrapper.active').forEach((arrow) => {
            this.remove_arrow(arrow);
        });
    }

    remove_arrow(arrow) {
        const from_task_id = arrow.getAttribute('data-from');
        const to_task_id = arrow.getAttribute('data-to');
        const arrow_id = from_task_id + ',' + to_task_id;
        const arrow_to_remove = this.arrows.find(
            (arrow) => arrow.id === arrow_id
        );

        if (arrow_to_remove) {
            arrow_to_remove.to_task.task.dependencies =
                arrow_to_remove.to_task.task.dependencies.filter(
                    (dep) => dep !== from_task_id
                );
            this.refresh_arrows();
        }
    }

    set_width() {
        const cur_width = this.$svg.getBoundingClientRect().width;
        const actual_width = this.$svg
            .querySelector('.grid .grid-row')
            .getAttribute('width');
        if (cur_width < actual_width) {
            this.$svg.setAttribute('width', actual_width);
        }
    }

    set_scroll_position() {
        const parent_element = this.$svg.parentElement;
        if (!parent_element) return;

        const hours_before_first_task = date_utils.diff(
            this.get_oldest_starting_date(),
            this.gantt_start,
            'hour'
        );

        const scroll_pos =
            (hours_before_first_task / this.options.step) *
                this.options.column_width -
            this.options.column_width;

        parent_element.scrollLeft = scroll_pos;
    }

    bind_grid_click() {
        $.on(
            this.$svg,
            this.options.popup_trigger,
            '.grid-row, .grid-header, .grid-day',
            () => {
                this.unselect_all();
                this.hide_popup();
            }
        );
    }

    bind_contextmenu() {
        $.bind(this.$container, 'contextmenu', (event) => {
            event.preventDefault();
            if (!this.menu) {
                this.menu = new ContextMenu(
                    [
                        {
                            label: 'Remove arrow',
                            show: (e) =>
                                !!$.closest('.arrow-wrapper', e.target),
                            handle: (e) => {
                                const arrow = $.closest(
                                    '.arrow-wrapper',
                                    e.target
                                );
                                if (arrow) {
                                    this.remove_arrow(arrow);
                                }
                            },
                        },
                        {
                            label: 'Remove bar',
                            show: (e) => !!$.closest('.bar-wrapper', e.target),
                            handle: (e) => {
                                const bar = $.closest('.bar-wrapper', e.target);
                                if (bar) {
                                    this.remove_bar(bar);
                                }
                            },
                        },
                        {
                            label: 'Create bar',
                            show: (e) => {
                                const elem = document.elementFromPoint(
                                    e.clientX,
                                    e.clientY
                                );
                                return (
                                    elem &&
                                    elem.matches &&
                                    elem.matches(
                                        '.grid-row,.grid-day,.row-line,.tick,.grid-header,.lower-text,.upper-text'
                                    )
                                );
                            },
                            handle: (e) => {
                                this.create_bar(e.offsetX, e.offsetY);
                            },
                        },
                    ],
                    this.$container
                );
            }
            this.menu.show(event);
        });
    }

    sort_bars_by_y() {
        const changed_bars = [];
        if (!this.bars) {
            return changed_bars;
        }
        this.bars = this.bars.sort((b0, b1) => {
            return b0.$bar.getY() - b1.$bar.getY();
        });

        this.tasks = this.bars.map((b, i) => {
            const task = b.task;
            if (task._index !== i) {
                changed_bars.push(b);
            }
            task._index = i;
            return task;
        });
        return changed_bars;
    }

    bind_date_events() {
        $.on(this.$svg, 'mouseover', '.lower-text', (e) => {
            const ts = e.target.getAttribute('data-ts');
            if (!ts) {
                return;
            }
            const special_day = this.options.special_days[ts];
            if (!special_day) {
                return;
            }
            const memo =
                special_day.memo ||
                (special_day.is_holiday ? 'holiday' : 'workday');
            this.show_tips(memo, e.target);
        });

        $.on(this.$svg, 'mouseout', '.lower-text', (e) => {
            this.hide_tips();
        });
    }

    show_tips(content, anchor) {
        if (!this.tips) {
            this.tips = new Tips();
        }
        this.tips.show(content, anchor);
    }

    hide_tips() {
        if (!this.tips) {
            return;
        }
        this.tips.hide();
    }

    bind_arrow_events() {
        $.bind(this.$svg, 'keyup', (e) => {
            if (['Backspace', 'Delete'].includes(e.key)) {
                const $arrow_wrapper = $.closest(
                    '.arrow-wrapper.active',
                    e.target
                );
                if ($arrow_wrapper) {
                    this.remove_active_arrows();
                }
            }
        });
    }

    bind_bar_events() {
        let is_dragging = false;
        let x_on_start = 0;
        let y_on_start = 0;
        let is_resizing_left = false;
        let is_resizing_right = false;
        let parent_bar_id = null;
        let bars = []; // instanceof Bars, the dragged bar and its children
        const min_y = this.options.header_height;
        const max_y =
            this.options.header_height +
            this.tasks.length *
                (this.options.bar_height + this.options.padding);
        this.bar_being_dragged = null; // instanceof dragged bar

        function action_in_progress() {
            return is_dragging || is_resizing_left || is_resizing_right;
        }

        $.on(
            this.$svg,
            'mousedown',
            '.bar-wrapper, .handle, .bar-connector',
            (e, element) => {
                const bar_wrapper = $.closest('.bar-wrapper', element);

                if (element.classList.contains('.bar-connector')) {
                    // see bind_bar_connect_events()
                    return;
                }
                if (element.classList.contains('left')) {
                    is_resizing_left = true;
                } else if (element.classList.contains('right')) {
                    is_resizing_right = true;
                } else if (
                    element.classList.contains('bar-wrapper') &&
                    this.options.drag_enabled
                ) {
                    is_dragging = true;
                }

                bar_wrapper.classList.add('active');

                x_on_start = e.offsetX;
                y_on_start = e.offsetY;

                parent_bar_id = bar_wrapper.getAttribute('data-id');
                const ids = [
                    parent_bar_id,
                    ...this.get_all_dependent_tasks(parent_bar_id),
                ];
                bars = ids.map((id) => {
                    const bar = this.get_bar(id);
                    if (parent_bar_id === id) {
                        this.bar_being_dragged = bar;
                    }
                    const $bar = bar.$bar;
                    $bar.ox = $bar.getX();
                    $bar.oy = $bar.getY();
                    $bar.owidth = $bar.getWidth();
                    $bar.finalx = $bar.ox;
                    $bar.finaly = $bar.oy;
                    $bar.finalw = $bar.owidth;
                    return bar;
                });
            }
        );

        $.on(this.$svg, 'mousemove', (e) => {
            if (!action_in_progress()) return;
            const dx = e.offsetX - x_on_start;
            const dy = e.offsetY - y_on_start;

            this.hide_popup();

            // update the dragged bar
            const bar_being_dragged = this.bar_being_dragged;
            if (is_resizing_left) {
                bar_being_dragged.$bar.finalx = this.get_snap_x(
                    bar_being_dragged.$bar.ox + dx
                );
                const finaldx =
                    bar_being_dragged.$bar.finalx - bar_being_dragged.$bar.ox;
                bar_being_dragged.$bar.finalw =
                    bar_being_dragged.$bar.owidth - finaldx;

                bar_being_dragged.update_bar_position({
                    x: bar_being_dragged.$bar.ox + dx,
                    width: bar_being_dragged.$bar.owidth - dx,
                });
            } else if (is_resizing_right) {
                bar_being_dragged.$bar.finalw =
                    this.get_snap_end_x(
                        bar_being_dragged.$bar.ox +
                            bar_being_dragged.$bar.owidth +
                            dx
                    ) - bar_being_dragged.$bar.ox;

                bar_being_dragged.update_bar_position({
                    width: bar_being_dragged.$bar.owidth + dx,
                });
            } else if (is_dragging) {
                bar_being_dragged.$bar.finalx = this.get_snap_x(
                    bar_being_dragged.$bar.ox + dx
                );
                let y = bar_being_dragged.$bar.oy + dy;
                if (y < min_y) {
                    y = min_y;
                } else if (y > max_y) {
                    y = max_y;
                }
                bar_being_dragged.update_bar_position({
                    x: bar_being_dragged.$bar.ox + dx,
                    y: this.options.sortable ? y : null,
                });
            }

            // update children
            bars.forEach((bar) => {
                if (bar.task.id === parent_bar_id) {
                    return;
                }
                const $bar = bar.$bar;
                this.hide_popup();
                if (is_resizing_left) {
                    $bar.finalx = this.get_snap_x($bar.ox + dx);
                    bar.update_bar_position({
                        x: $bar.ox + dx,
                    });
                } else if (is_dragging) {
                    $bar.finalx = this.get_snap_x($bar.ox + dx);
                    bar.update_bar_position({
                        x: $bar.ox + dx,
                    });
                }
            });

            // update y pos
            const finaldy =
                bar_being_dragged.$bar.finaly - bar_being_dragged.$bar.oy;
            if (
                this.options.sortable &&
                is_dragging &&
                Math.abs(dy - finaldy) > bar_being_dragged.height
            ) {
                this.sort_bars_by_y().map((bar) => {
                    const y = bar.compute_y();
                    if (bar.task.id === parent_bar_id) {
                        bar.$bar.finaly = y;
                        return;
                    }
                    bar.update_bar_position({ y: y });
                });
            }
        });

        document.addEventListener('mouseup', (e) => {
            const dx = e.offsetX - x_on_start;
            const dy = e.offsetY - y_on_start;
            if (is_dragging || is_resizing_left || is_resizing_right) {
                bars.forEach((bar) => {
                    bar.group.classList.remove('active');
                    if (
                        bar.$bar.finalx !== bar.$bar.ox + dx ||
                        bar.$bar.finalw != bar.$bar.owidth
                    ) {
                        bar.update_bar_position({
                            x: bar.$bar.finalx,
                            width: bar.$bar.finalw,
                        });
                    }
                    if (
                        bar.$bar.finalx !== bar.$bar.ox ||
                        bar.$bar.finalw != bar.$bar.owidth
                    ) {
                        bar.date_changed();
                        bar.set_action_completed();
                    }
                });
                const $bar = this.bar_being_dragged.$bar;
                const finaldy = $bar.finaly - $bar.oy;
                if (this.options.sortable && dy !== finaldy) {
                    this.bar_being_dragged.update_bar_position({
                        y: $bar.finaly,
                    });
                }
                this.update_gantt_dates();
            }

            this.bar_being_dragged = null;
            is_dragging = false;
            is_resizing_left = false;
            is_resizing_right = false;
        });

        this.bind_bar_del_event();
        this.bind_bar_progress();
        this.bind_bar_connect_events();
    }

    update_gantt_dates() {
        let min_date = null;
        let max_date = null;
        this.tasks.forEach((task) => {
            if (min_date === null || min_date > task._start) {
                min_date = task._start;
            }
            if (max_date === null || max_date < task._end) {
                max_date = task._end;
            }
        });
        if (
            date_utils.diff(min_date, this.gantt_start, 'hour') <=
                this.options.step ||
            date_utils.diff(this.gantt_end, max_date, 'hour') <=
                this.options.step
        ) {
            this.re_render();
        }
    }

    bind_bar_del_event() {
        $.bind(this.$svg, 'keyup', (e) => {
            if (['Backspace', 'Delete'].includes(e.key)) {
                const $bar_wrapper = $.closest('.bar-wrapper.active', e.target);
                if ($bar_wrapper) {
                    this.remove_active_bars();
                }
            }
        });
    }

    get_bar_from_element(el) {
        if (!el) {
            return null;
        }
        const $bar_wrapper = $.closest('.bar-wrapper', el);
        if (!$bar_wrapper) {
            return null;
        }
        const task_id = $bar_wrapper.getAttribute('data-id');
        const bar = this.get_bar(task_id);
        if (!bar) {
            return null;
        }
        return bar;
    }

    bind_bar_connect_events() {
        let is_connecting = false;
        let arrow = null;

        $.on(this.$svg, 'mousedown', '.bar-connector', (e, el) => {
            const bar = this.get_bar_from_element(el);
            if (!bar) {
                return;
            }
            is_connecting = true;
            arrow = Arrow.create_with_end_xy(this, bar, e.offsetX, e.offsetY);
            arrow.group.classList.add('connecting');
            this.layers.arrow.appendChild(arrow.group);
        });

        $.on(this.$svg, 'mousemove', (e) => {
            if (!is_connecting) {
                return;
            }
            const $hover_el = document.elementFromPoint(e.clientX, e.clientY);
            const to_task_bar = this.get_bar_from_element($hover_el);
            if (to_task_bar) {
                arrow.update_to_task(to_task_bar);
            } else {
                arrow.update_end_xy(e.offsetX, e.offsetY);
            }
        });

        $.on(this.$svg, 'mouseup', (e) => {
            if (!is_connecting) {
                return;
            }
            is_connecting = false;
            if (!arrow) {
                return;
            }
            if (
                arrow.to_task &&
                arrow.to_task.task.dependencies.indexOf(
                    arrow.from_task.task.id
                ) < 0
            ) {
                arrow.to_task.task.dependencies.push(arrow.from_task.task.id);
                this.refresh_arrows();
            }
            arrow.group.remove();
            arrow = null;
        });
    }

    bind_bar_progress() {
        let x_on_start = 0;
        let y_on_start = 0;
        let is_resizing = null;
        let bar = null;
        let $bar_progress = null;
        let $bar = null;

        $.on(this.$svg, 'mousedown', '.handle.progress', (e, handle) => {
            is_resizing = true;
            x_on_start = e.offsetX;
            y_on_start = e.offsetY;

            const $bar_wrapper = $.closest('.bar-wrapper', handle);
            const id = $bar_wrapper.getAttribute('data-id');
            bar = this.get_bar(id);

            $bar_progress = bar.$bar_progress;
            $bar = bar.$bar;

            $bar_progress.finaldx = 0;
            $bar_progress.owidth = $bar_progress.getWidth();
            $bar_progress.min_dx = -$bar_progress.getWidth();
            $bar_progress.max_dx = $bar.getWidth() - $bar_progress.getWidth();
        });

        $.on(this.$svg, 'mousemove', (e) => {
            if (!is_resizing) return;
            let dx = e.offsetX - x_on_start;
            let dy = e.offsetY - y_on_start;

            if (dx > $bar_progress.max_dx) {
                dx = $bar_progress.max_dx;
            }
            if (dx < $bar_progress.min_dx) {
                dx = $bar_progress.min_dx;
            }

            const $handle = bar.$handle_progress;
            $.attr($bar_progress, 'width', $bar_progress.owidth + dx);
            $.attr($handle, 'points', bar.get_progress_polygon_points());
            $bar_progress.finaldx = dx;
        });

        $.on(this.$svg, 'mouseup', () => {
            is_resizing = false;
            if (!($bar_progress && $bar_progress.finaldx)) return;
            bar.progress_changed();
            bar.set_action_completed();

            bar = null;
            $bar_progress = null;
            $bar = null;
        });
    }

    get_all_dependent_tasks(task_id) {
        let out = [];
        let to_process = [task_id];
        while (to_process.length) {
            const deps = to_process.reduce((acc, curr) => {
                acc = acc.concat(this.dependency_map[curr]);
                return acc;
            }, []);

            to_process = deps.filter((d) => !out.includes(d));
            out = out.concat(to_process);
        }

        return out.filter((id) => id && id !== task_id);
    }

    get_snap_position(dx) {
        let odx = dx,
            rem,
            position;

        if (this.view_is(VIEW_MODE.WEEK)) {
            rem = dx % (this.options.column_width / 7);
            position =
                odx -
                rem +
                (rem < this.options.column_width / 14
                    ? 0
                    : this.options.column_width / 7);
        } else if (this.view_is(VIEW_MODE.MONTH)) {
            rem = dx % (this.options.column_width / 30);
            position =
                odx -
                rem +
                (rem < this.options.column_width / 60
                    ? 0
                    : this.options.column_width / 30);
        } else {
            rem = dx % this.options.column_width;
            position =
                odx -
                rem +
                (rem < this.options.column_width / 2
                    ? 0
                    : this.options.column_width);
        }
        return position;
    }

    get_snap_x(ox) {
        let min_dx = this.options.column_width;
        if (this.view_is(VIEW_MODE.WEEK)) {
            min_dx = this.options.column_width / 7;
        } else if (this.view_is(VIEW_MODE.MONTH)) {
            min_dx = this.options.column_width / 30;
        }
        return ox - (ox % min_dx);
    }

    get_snap_end_x(ox) {
        let min_dx = this.options.column_width;
        if (this.view_is(VIEW_MODE.WEEK)) {
            min_dx = this.options.column_width / 7;
        } else if (this.view_is(VIEW_MODE.MONTH)) {
            min_dx = this.options.column_width / 30;
        }
        const width_of_sec =
            this.options.column_width / this.options.step / 3600;
        return ox - (ox % min_dx) + min_dx - width_of_sec;
    }

    compute_dates_for_new_task(x) {
        const final_x = this.get_snap_x(x);
        const start = date_utils.add(
            this.gantt_start,
            (final_x / this.options.column_width) * this.options.step,
            'hour'
        );
        const end = date_utils.add(
            start,
            this.options.step * 3 * 3600 - 1,
            'second'
        );
        return { start, end };
    }

    compute_index_for_new_task(y) {
        return Math.max(
            0,
            Math.floor(
                (y - this.options.header_height - this.options.padding) /
                    (this.options.bar_height + this.options.padding)
            )
        );
    }

    create_bar(x, y) {
        const { start, end } = this.compute_dates_for_new_task(x);
        const index = this.compute_index_for_new_task(y);
        const new_task = {
            _start: start,
            _end: end,
            _index: index,
            name: 'New Task',
            id: 'tid-' + Date.now(),
            progress: 0,
            dependencies: [],
        };

        const tasks = [];
        let idx = 0;
        this.tasks.forEach((task) => {
            if (idx === new_task._index) {
                tasks.push(new_task);
                idx++;
            }
            tasks.push(task);
            task._index = idx++;
        });
        this.tasks = tasks;
        this.setup_dependencies();
        this.re_render();
        this.bars[new_task._index].show_input();
    }

    unselect_all() {
        [...this.$svg.querySelectorAll('.bar-wrapper')].forEach((el) => {
            el.classList.remove('active');
        });

        [...this.$svg.querySelectorAll('.arrow-wrapper')].forEach((el) => {
            el.classList.remove('active');
        });
    }

    view_is(modes) {
        if (typeof modes === 'string') {
            return this.options.view_mode === modes;
        }

        if (Array.isArray(modes)) {
            return modes.some((mode) => this.options.view_mode === mode);
        }

        return false;
    }

    get_task(id) {
        return this.tasks.find((task) => {
            return task.id === id;
        });
    }

    get_bar(id) {
        return this.bars.find((bar) => {
            return bar.task.id === id;
        });
    }

    show_popup(options) {
        if (!this.popup) {
            this.popup = new Popup(
                this.popup_wrapper,
                this.options.custom_popup_html
            );
        }
        this.popup.show(options);
    }

    hide_popup() {
        this.popup && this.popup.hide();
    }

    trigger_event(event, args) {
        if (this.options['on_' + event]) {
            this.options['on_' + event].apply(null, args);
        }
    }

    /**
     * Gets the oldest starting date from the list of tasks
     *
     * @returns Date
     * @memberof Gantt
     */
    get_oldest_starting_date() {
        return this.tasks
            .map((task) => task._start)
            .reduce((prev_date, cur_date) =>
                cur_date <= prev_date ? cur_date : prev_date
            );
    }

    /**
     * Clear all elements from the parent svg element
     *
     * @memberof Gantt
     */
    clear() {
        this.$svg.innerHTML = '';
    }
}

Gantt.VIEW_MODE = VIEW_MODE;
Gantt.date_utils = date_utils;

function generate_id(task) {
    return task.name + '_' + Math.random().toString(36).slice(2, 12);
}
