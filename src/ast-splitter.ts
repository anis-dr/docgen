import { err, ok, Result } from 'neverthrow';
import ts from 'typescript';

export interface Chunk {
	id: string; // Unique identifier for the chunk
	symbol: string; // Name of the symbol (function/class/etc)
	type: 'function' | 'class' | 'interface' | 'enum' | 'variable' | 'type';
	scope: 'module' | 'local'; // Whether the symbol is at module level or inside a function
	startLine: number;
	endLine: number;
	text: string; // The actual code including needed imports
	imports: string[]; // List of imports this chunk uses
	leadingComments: string; // JSDoc and other comments
	referencedSymbols: string[]; // Other symbols this chunk references
}

interface ImportDeclaration {
	text: string; // Full import statement
	symbols: Set<string>; // Imported symbols
	startLine: number;
	endLine: number;
}

export interface SplitterOptions {
	deep?: boolean;
}

export class AstSplitter {
	private sourceFile: ts.SourceFile;
	private imports: ImportDeclaration[] = [];
	private typeChecker: ts.TypeChecker;
	private deep: boolean;

	private isModuleScope(node: ts.Node): boolean {
		const pk = node.parent?.kind;
		return pk === ts.SyntaxKind.SourceFile || pk === ts.SyntaxKind.ModuleBlock;
	}

	constructor(
		private program: ts.Program,
		private filePath: string,
		options: SplitterOptions = {},
	) {
		this.sourceFile = program.getSourceFile(filePath)!;
		this.typeChecker = program.getTypeChecker();
		this.deep = options.deep || false;
	}

	private extractImports(): void {
		ts.forEachChild(this.sourceFile, (node) => {
			if (ts.isImportDeclaration(node)) {
				const importText = node.getText(this.sourceFile);
				const symbols = new Set<string>();

				// Extract imported symbols
				if (node.importClause) {
					if (node.importClause.name) {
						symbols.add(node.importClause.name.text);
					}
					const bindings = node.importClause.namedBindings;
					if (bindings) {
						if (ts.isNamedImports(bindings)) {
							bindings.elements.forEach((element) => {
								symbols.add(element.name.text);
							});
						} else if (ts.isNamespaceImport(bindings)) {
							symbols.add(bindings.name.text);
						}
					}
				}

				this.imports.push({
					text: importText,
					symbols,
					startLine:
						this.sourceFile.getLineAndCharacterOfPosition(node.getStart())
							.line + 1,
					endLine:
						this.sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line +
						1,
				});
			}
		});
	}

	private getLeadingComments(node: ts.Node): string {
		const fullText = this.sourceFile.getFullText();
		const nodeStart = node.getFullStart();
		const comments: string[] = [];

		// Get all comments that precede this node
		ts.forEachLeadingCommentRange(fullText, nodeStart, (pos, end) => {
			const commentText = fullText.slice(pos, end);
			comments.push(commentText);
		});

		return comments.join('\n');
	}

	private getReferencedSymbols(node: ts.Node): string[] {
		const symbols = new Set<string>();

		const visit = (node: ts.Node) => {
			// Collect identifier references
			if (ts.isIdentifier(node)) {
				const symbol = this.typeChecker.getSymbolAtLocation(node);
				if (symbol) {
					symbols.add(symbol.getName());
				}
			}
			ts.forEachChild(node, visit);
		};

		visit(node);
		return Array.from(symbols);
	}

	private getRequiredImports(referencedSymbols: string[]): ImportDeclaration[] {
		return this.imports.filter((imp) =>
			Array.from(imp.symbols).some((symbol) =>
				referencedSymbols.includes(symbol),
			),
		);
	}

	private createChunk(
		node: ts.Node,
		type: Chunk['type'],
		symbol: string,
		scope: 'module' | 'local' = 'module',
	): Chunk {
		const startPos = node.getStart();
		const endPos = node.getEnd();
		const startLine =
			this.sourceFile.getLineAndCharacterOfPosition(startPos).line + 1;
		const endLine =
			this.sourceFile.getLineAndCharacterOfPosition(endPos).line + 1;

		// Get the node's text without imports
		const nodeText = node.getText(this.sourceFile);

		// Get referenced symbols and required imports
		const referencedSymbols = this.getReferencedSymbols(node);
		const requiredImports = this.getRequiredImports(referencedSymbols);

		// Build the full chunk text with imports
		const importText = requiredImports.map((imp) => imp.text).join('\n');
		const leadingComments = this.getLeadingComments(node);
		const fullText = [importText, leadingComments, nodeText]
			.filter(Boolean)
			.join('\n\n');

		return {
			id: `${this.filePath}:${symbol}:${startLine}-${endLine}`,
			symbol,
			type,
			scope,
			startLine,
			endLine,
			text: fullText,
			imports: requiredImports.map((imp) => imp.text),
			leadingComments,
			referencedSymbols,
		};
	}

	public split(): Result<Chunk[], Error> {
		try {
			const chunks: Chunk[] = [];
			this.extractImports();

			const visit = (node: ts.Node) => {
				let chunk: Chunk | undefined;

				if (ts.isFunctionDeclaration(node) && node.name) {
					chunk = this.createChunk(node, 'function', node.name.text);
				} else if (ts.isClassDeclaration(node) && node.name) {
					chunk = this.createChunk(node, 'class', node.name.text);
				} else if (ts.isInterfaceDeclaration(node) && node.name) {
					chunk = this.createChunk(node, 'interface', node.name.text);
				} else if (ts.isEnumDeclaration(node) && node.name) {
					chunk = this.createChunk(node, 'enum', node.name.text);
				} else if (ts.isVariableStatement(node)) {
					// For variables, handle based on deep mode and scope
					const isTopLevel = this.isModuleScope(node);

					// In normal mode, only include top-level variables
					// In deep mode, include all variables but mark scope
					if (isTopLevel || this.deep) {
						node.declarationList.declarations.forEach((decl) => {
							if (ts.isIdentifier(decl.name)) {
								const scope = isTopLevel ? 'module' : 'local';
								chunk = this.createChunk(
									node,
									'variable',
									decl.name.text,
									scope,
								);
							}
						});
					}
				} else if (ts.isTypeAliasDeclaration(node) && node.name) {
					chunk = this.createChunk(node, 'type', node.name.text);
				}

				if (chunk) {
					chunks.push(chunk);
				}

				// Determine whether to recurse into this node
				const shouldSkipChildNodes =
					!this.deep &&
					(ts.isFunctionDeclaration(node) ||
						ts.isMethodDeclaration(node) ||
						ts.isArrowFunction(node) ||
						ts.isFunctionExpression(node));

				// In deep mode, we traverse everything
				// In normal mode, we skip function bodies
				if (!shouldSkipChildNodes) {
					ts.forEachChild(node, visit);
				}
			};

			visit(this.sourceFile);
			return ok(chunks);
		} catch (error) {
			return err(
				error instanceof Error
					? error
					: new Error('Unknown error in AST splitting'),
			);
		}
	}
}

export function astSplitFile(
	program: ts.Program,
	filePath: string,
	options: SplitterOptions = {},
): Result<Chunk[], Error> {
	const splitter = new AstSplitter(program, filePath, options);
	return splitter.split();
}
