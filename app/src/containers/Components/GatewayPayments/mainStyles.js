
import { makeStyles } from '@material-ui/styles';

const MainStyles = makeStyles(() => {
  return {
    root: { width: "100%", justifyContent: "center" },
    stadiumMap: { justifyContent: "center", marginTop: "20px" },
    sectorSelect: { marginLeft: "20px", marginTop: "20px" },
    sectorName: { alignSelf: "center" },
    sector: {
      width: "150px",
      cursor: "pointer",
      background: "#ef233c",
      textAlign: "center",
      padding: "10px",
      color: "#ffffff",
      border: "1px solid #FFFFFF",
      "&.topLeft": { borderTopLeftRadius: "25px" },
      "&.topRight": { borderTopRightRadius: "25px" },
      "&:hover": {
        background: "#ffffff",
        color: "#ef233c",
        fontWeight: 600,
        border: "1px solid #ef233c",
      },
    },
    divRedonda: { marginTop: "92px" },
    redonda: {
      width: "100px",
      height: "200px",
      cursor: "pointer",
      background: "#ef233c",
      textAlign: "center",
      padding: "10px",
      color: "#ffffff",
      border: "1px solid #FFFFFF",
      "&:hover": {
        background: "#ffffff",
        color: "#ef233c",
        fontWeight: 600,
        border: "1px solid #ef233c",
      },
    },
  };
});

export default MainStyles;
