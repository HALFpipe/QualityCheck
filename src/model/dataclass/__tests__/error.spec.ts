import { NodeError } from "../error";
import { entities } from "../../record/entity";

describe("NodeError", () => {
  it.each([
    [
      "nipype.fmriprep_wf.single_subject_01_wf.anat_preproc_wf.anat_validate",
      {
        sub: "01",
      },
    ],
    [
      "nipype.features_wf.single_subject_01_wf.func_preproc_task_faces_wf.taskbased_wf.contrast_tsv",
      {
        sub: "01",
        task: "faces",
      },
    ],
    [
      "nipype.features_wf.single_subject_01_wf.func_preproc_task_faces_run_02_wf.taskbased_wf.contrast_tsv",
      {
        sub: "01",
        task: "faces",
        run: "02",
      },
    ],
  ])("parse %s", (nodename: string, expected: any) => {
    NodeError.load({
      node: nodename,
    }).then((nodeError) => {

      console.log(nodeError);
      for (let entity of entities) {
        if (entity in expected) {
          expect(nodeError[entity]).toEqual(expected[entity]);
        } else {
          expect(nodeError[entity] == null).toEqual(true);
        }
      }

    });
  });

  it("parse model node", () => {
    expect(NodeError.load({
      node: "nipype.models_wf.model_wf.modelspec",
    })).rejects.toThrow();
  });
});
