# AGENTS.md - NestJS API

## Build/Test Commands

- `npm run build` - Build the project
- `npm run lint` - Run ESLint with auto-fix
- `npm run test` - Run all unit tests
- `npm run test -- --testPathPattern=app.controller` - Run single test file
- `npm run test:e2e` - Run end-to-end tests
- `npm run start:dev` - Start dev server with watch mode

## Code Style

- **Formatting**: Prettier with single quotes, trailing commas (run `npm run format`)
- **Imports**: External packages first, then relative imports with `./` prefix
- **Types**: Use explicit return types on methods; `any` is allowed but discouraged
- **Naming**: PascalCase for classes/interfaces, camelCase for methods/variables
- **Files**: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.spec.ts` conventions

## NestJS Patterns

- Use decorators: `@Controller()`, `@Injectable()`, `@Module()`, `@Get()`, etc.
- Inject dependencies via constructor with `private readonly` modifier
- Tests use `@nestjs/testing` with `Test.createTestingModule()` pattern
- Modules group related controllers and providers
