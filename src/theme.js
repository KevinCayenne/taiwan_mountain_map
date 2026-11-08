import { createTheme } from '@mui/material/styles';

const fontFamily = [
    '"Noto Sans TC"',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif',
].join(',');

const theme = createTheme({
    palette: {
        primary: {
            main: '#2f6b4f',
            light: '#5c9a7b',
            dark: '#1d4a35',
            contrastText: '#ffffff',
        },
        secondary: {
            main: '#e08a2e',
            contrastText: '#ffffff',
        },
        background: {
            default: '#f4f6f4',
            paper: '#ffffff',
        },
        text: {
            primary: '#1f2a24',
            secondary: '#5f6b64',
        },
    },
    shape: {
        borderRadius: 12,
    },
    typography: {
        fontFamily,
        button: {
            textTransform: 'none',
            fontWeight: 600,
        },
    },
    components: {
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                },
            },
        },
        MuiButton: {
            defaultProps: {
                disableElevation: true,
            },
            styleOverrides: {
                root: {
                    borderRadius: 10,
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    fontWeight: 500,
                },
            },
        },
        MuiTooltip: {
            defaultProps: {
                arrow: true,
            },
        },
    },
});

export default theme;
