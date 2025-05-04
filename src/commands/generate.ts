import { ok } from 'neverthrow';
import ora from 'ora';

export const generateCommand = () => {
	const spinner = ora('Generating docs...').start();
	setTimeout(() => {
		spinner.succeed('Docs generated (stub).');
	}, 1000);
};

function foo() {
	return ok(123);
}

foo();
