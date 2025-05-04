import { ok } from 'neverthrow';
import ora from 'ora';

export const indexCommand = () => {
	const spinner = ora('Indexing project...').start();
	setTimeout(() => {
		spinner.succeed('Index complete (stub).');
	}, 1000);
};

function foo() {
	return ok(123);
}

foo();
