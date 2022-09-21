import sass from 'rollup-plugin-sass';
import { terser } from 'rollup-plugin-terser';

const dev = {
    input: 'src/index.js',
    output: {
        name: 'Gantt',
        file: 'dist/frappe-gantt.js',
        sourcemap: true,
        format: 'iife',
    },
    plugins: [
        sass({
            output: true,
        }),
    ],
};

const umd = {
    input: 'src/index.js',
    output: {
        name: 'Gantt',
        file: 'dist/frappe-gantt.umd.js',
        sourcemap: true,
        format: 'umd',
    },
    plugins: [
        sass({
            output: true,
        }),
    ],
};

const prod = {
    input: 'src/index.js',
    output: {
        name: 'Gantt',
        file: 'dist/frappe-gantt.min.js',
        sourcemap: true,
        format: 'iife',
    },
    plugins: [
        sass({
            output: true,
            options: {
                outputStyle: 'compressed',
            },
        }),
        terser(),
    ],
};

export default [dev, umd, prod];
