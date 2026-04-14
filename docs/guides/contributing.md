# Contributing to AlecRae

Thank you for your interest in contributing to AlecRae. This guide covers the development workflow, code standards, and review process.

## Development Workflow

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone git@github.com:your-username/alecrae.git
cd alecrae
git remote add upstream git@github.com:your-org/alecrae.git
```

### 2. Create a Branch

Branch from `main` using a descriptive name:

```bash
git checkout -b feat/add-bounce-webhook-handler
```

Branch naming conventions:

- `feat/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation changes
- `test/` - Test additions or improvements
- `chore/` - Maintenance tasks (dependencies, CI, etc.)

### 3. Make Your Changes

Follow the code standards described below. Write tests for your changes.

### 4. Commit Your Changes

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting, missing semicolons, etc. (no code change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `chore` | Maintenance tasks |
| `ci` | CI/CD changes |

**Scopes** match the package or service name: `mta`, `web`, `api`, `db`, `sentinel`, `ai-engine`, etc.

**Examples:**

```bash
git commit -m "feat(mta): add DKIM signing for outbound emails"
git commit -m "fix(inbound): handle malformed MIME boundaries gracefully"
git commit -m "test(sentinel): add unit tests for cache invalidation"
git commit -m "docs(api): update webhook endpoint documentation"
```

### 5. Push and Open a Pull Request

```bash
git push origin feat/add-bounce-webhook-handler
```

Open a pull request against `main` on GitHub. Fill in the PR template with:

- A summary of what the change does and why
- How to test the change
- Any related issues

## Code Standards

### TypeScript

- **Strict mode** is required (`strict: true`, `noUncheckedIndexedAccess: true`).
- No `any` types. Use `unknown` and narrow with type guards.
- Prefer `const` assertions and discriminated unions.
- Use Result types for business logic error handling, not try/catch.
- All public functions and types must have JSDoc comments.

### Linting and Formatting

All code must pass ESLint and Prettier:

```bash
# Check linting
bun run lint

# Fix auto-fixable issues
bun run lint:fix

# Check formatting
bun run format:check

# Apply formatting
bun run format
```

These checks run automatically via pre-commit hooks. Do not skip them.

### Frontend

- No raw HTML elements. Everything must use the component library from `@alecrae/ui`.
- Server Components by default; Client Components only when necessary.
- All components must be accessible (ARIA attributes, keyboard navigation).
- No inline styles. Use Tailwind CSS classes or CSS modules.
- New components must have Storybook stories.

### API Design

- All public API endpoints must have OpenAPI specifications.
- Use Zod schemas for request/response validation.
- Follow REST conventions for resource naming and HTTP methods.
- All endpoints must include rate limiting and authentication.

## Testing Requirements

All pull requests must maintain or improve code coverage. The minimum threshold is **80% coverage** for all packages and services.

```bash
# Run all tests
bun run test

# Run tests with coverage report
bun run test:coverage

# Run tests for a specific package
bun run test --filter=@alecrae/mta
```

### What to Test

- **Unit tests** for all business logic, utilities, and pure functions.
- **Integration tests** for API endpoints, database operations, and service interactions.
- **Edge cases** including malformed input, empty data, and error conditions.

### Test File Conventions

- Test files live alongside the source files or in a `tests/` directory within each package.
- Name test files with the `.test.ts` or `.spec.ts` suffix.
- Use descriptive test names that explain the expected behavior.

## Pull Request Review Process

### Before Submitting

1. Ensure all tests pass: `bun run test`
2. Ensure linting passes: `bun run lint`
3. Ensure formatting passes: `bun run format:check`
4. Ensure the build succeeds: `bun run build`
5. Update documentation if your change affects public APIs or behavior.

### Review Criteria

Reviewers evaluate PRs on:

- **Correctness** - Does the code do what it claims?
- **Tests** - Are there sufficient tests covering the changes?
- **Performance** - Does it meet the performance targets defined in `CLAUDE.md`?
- **Security** - Are there any security concerns (input validation, secret handling)?
- **Readability** - Is the code clear and well-documented?
- **Architecture** - Does it follow the project's architectural patterns?

### Review Timeline

- PRs are typically reviewed within 1-2 business days.
- Address review feedback with new commits (do not force-push during review).
- Once approved, the PR will be squash-merged into `main`.

## Architecture Decision Records

Significant architectural decisions are documented as Architecture Decision Records (ADRs) in `docs/architecture/`. If your change introduces a new pattern, dependency, or architectural approach:

1. Create a new ADR file: `docs/architecture/NNNN-title.md`
2. Use the template:
   ```
   # NNNN - Title

   ## Status
   Proposed / Accepted / Deprecated / Superseded

   ## Context
   What is the issue that we are seeing that motivates this decision?

   ## Decision
   What is the change that we are proposing?

   ## Consequences
   What becomes easier or more difficult because of this change?
   ```
3. Reference the ADR in your PR description.

## Code of Conduct

All contributors are expected to follow our Code of Conduct. In summary:

- Be respectful and inclusive in all interactions.
- Provide constructive feedback focused on the code, not the person.
- Assume good intent from other contributors.
- Report unacceptable behavior to the maintainers.

See `CODE_OF_CONDUCT.md` in the repository root for the full policy.

## Questions?

If you have questions about contributing, open a GitHub Discussion or reach out to the maintainers.
