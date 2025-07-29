# R Package Analytics - Development Notes

## Project Structure

This is a web application for analyzing R package download statistics from both CRAN and Bioconductor repositories.

### Key Components
- **Frontend**: HTML/CSS/JavaScript with two main sections:
  - `index.html`: CRAN package analytics (5 tabs)
  - `bioconductor.html`: Bioconductor package analytics (4 tabs)
- **Styling**: `styles.css` with Apple-inspired design system
- **Backend**: Node.js server (`server.js`)
- **Data**: Package statistics stored in `/data` directory

## Mobile Responsiveness Insights

### Typography System
The application uses CSS custom properties for consistent typography:
- `--font-size-xs`: 0.75rem (12px)
- `--font-size-sm`: 0.875rem (14px) 
- `--font-size-base`: 1rem (16px)
- `--font-size-lg`: 1.125rem (18px)
- `--font-size-xl`: 1.25rem (20px)

### Mobile Font Size Issue
Found inconsistency between desktop and mobile font sizes in navigation tabs:

**Problem:**
- Desktop: tab-label used `--font-size-lg` (18px), tab-description used `--font-size-sm` (14px)
- Mobile: tab-label used `--font-size-base` (16px), tab-description used `--font-size-xs` (12px)

**Solution (styles.css:1800-1806):**
```css
@media (max-width: 480px) {
    .tab-label {
        font-size: var(--font-size-lg);  /* Changed from --font-size-base */
    }
    
    .tab-description {
        font-size: var(--font-size-sm);  /* Changed from --font-size-xs */
    }
}
```

### Responsive Breakpoints
The application uses multiple breakpoints:
- `@media (max-width: 1024px)`: Tablet adjustments
- `@media (max-width: 768px)`: Mobile layout changes
- `@media (max-width: 480px)`: Small mobile devices
- `@media (max-width: 400px)`: Very small screens

## Navigation Structure

### CRAN Section (5 tabs)
1. Search by Name - Analyze specific packages
2. Discover by Keywords - Find relevant packages  
3. Search by Author - Find packages by author
4. Common Packages - Packages organized by category
5. CRAN Statistics - Ecosystem insights

### Bioconductor Section (4 tabs)
1. Search by Name - Analyze specific packages
2. Discover by Keywords - Find relevant packages
3. Browse by Category - Software, Annotation, Experiment
4. Research Areas - By biological domain

## Deployment

### Google Cloud Platform
- Project ID: melodic-zoo-458222-s6
- Project Number: 86199234858
- Deployed using Google App Engine
- URL: https://melodic-zoo-458222-s6.uc.r.appspot.com

### GitHub Repository
- Changes committed with descriptive messages
- Consistent with existing commit style
- Repository: https://github.com/zhangxiany-tamu/r-package-analytics

## Design System Notes

The application follows Apple's design principles:
- Glass morphism effects with backdrop blur
- Consistent color palette using CSS custom properties
- Smooth transitions and animations
- Layered shadows for depth
- Responsive grid layouts

## Best Practices Applied

1. **CSS Organization**: Consistent use of custom properties for maintainability
2. **Mobile-First**: Responsive design with multiple breakpoints
3. **Accessibility**: Proper semantic HTML structure
4. **Performance**: Efficient CSS selectors and minimal redundancy
5. **Version Control**: Meaningful commit messages and clean git history