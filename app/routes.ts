import { index, type RouteConfig, route } from '@react-router/dev/routes'

/**
 * Three routes carry the whole site.
 *
 * Every documentation page is the same page with different content, so it is
 * one route reading one JSON file. Adding a page upstream needs no change here
 * -- which is the point: the docs decide what exists, this repo decides how it
 * looks.
 */
export default [
  index('routes/home.tsx'),
  route('playground', 'routes/playground.tsx'),
  // Last: the splat matches everything, so any real route has to precede it.
  route('*', 'routes/page.tsx'),
] satisfies RouteConfig
