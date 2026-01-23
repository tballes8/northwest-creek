"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTheme = exports.ThemeProvider = void 0;
var react_1 = require("react");
var ThemeContext = (0, react_1.createContext)(undefined);
var ThemeProvider = function (_a) {
    var children = _a.children;
    var _b = (0, react_1.useState)(function () {
        // Check localStorage first
        var savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            return savedTheme;
        }
        // Check system preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }), theme = _b[0], setTheme = _b[1];
    (0, react_1.useEffect)(function () {
        // Update document class and localStorage
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        }
        else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);
    var toggleTheme = function () {
        setTheme(function (prev) { return prev === 'light' ? 'dark' : 'light'; });
    };
    return (<ThemeContext.Provider value={{ theme: theme, toggleTheme: toggleTheme }}>
      {children}
    </ThemeContext.Provider>);
};
exports.ThemeProvider = ThemeProvider;
var useTheme = function () {
    var context = (0, react_1.useContext)(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
exports.useTheme = useTheme;
