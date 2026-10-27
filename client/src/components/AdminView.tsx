import { useContext} from "react";

// components
import { WordQuestAnswerAdmin } from "@/components/wordquest/wordQuestAnswerAdmin";

// context
import { GlobalStateContext } from "@/context/GlobalContext";

export const AdminView = () => {
  const { droppedAsset } = useContext(GlobalStateContext);
  const imgSrc = droppedAsset?.topLayerURL || droppedAsset?.bottomLayerURL;

  return (
    <div style={{ position: "relative" }}>
      {imgSrc && <img className="w-96 h-96 object-cover rounded-2xl my-4" alt="preview" src={imgSrc} />}
      <WordQuestAnswerAdmin />
    </div>
  );
};

export default AdminView;