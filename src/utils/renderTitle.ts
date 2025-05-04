import figlet from 'figlet';

export const renderTitle = () => {
	const text = figlet.textSync('Docgen', {
		font: 'Small',
	});
	console.log(`\n${text}\n`);
};
