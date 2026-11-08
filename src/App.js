import './App.css';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import MapContainerDiv from './components/MapContainerDiv/MapContainerDiv';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="App">
        <MapContainerDiv />
      </div>
    </ThemeProvider>
  );
}

export default App;
